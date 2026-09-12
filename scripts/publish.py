#!/usr/bin/env python3
"""NC / GeoTIFF -> final COG + atomic product index. No source files are modified."""
import argparse, glob, hashlib, json, os, re, tempfile
from pathlib import Path
from datetime import datetime, timezone
import numpy as np
from netCDF4 import Dataset
from osgeo import gdal, osr
from deployment_config import load_deployment, member_paths

gdal.UseExceptions()
PIPELINE_VERSION='1.0.2'
NODATA=-3.4028234663852886e38

def atomic_json(path, data):
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(dir=path.parent,suffix='.tmp')
    try:
        with os.fdopen(fd,'w') as f: json.dump(data,f,ensure_ascii=False,indent=2,allow_nan=False)
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)

def timestamp(path, explicit=None):
    if explicit:
        t=datetime.fromisoformat(explicit.replace('Z','+00:00'))
        if t.tzinfo is None: raise ValueError('datetime must contain timezone')
    else:
        m=re.search(r'(\d{8})[_T](\d{4})',Path(path).stem)
        if not m: raise ValueError('Cannot infer time; specify --datetime')
        t=datetime.strptime(''.join(m.groups()),'%Y%m%d%H%M').replace(tzinfo=timezone.utc)
    return t.astimezone(timezone.utc).isoformat().replace('+00:00','Z')

def resolution_from_geolocation(lon,lat):
    values=[]
    for axis in (0,1):
        dx=np.diff(lon,axis=axis); dy=np.diff(lat,axis=axis)
        delta=np.hypot(dx,dy)
        good=delta[np.isfinite(delta)&(delta>1e-7)&(delta<5)]
        if good.size<10: raise ValueError('Insufficient adjacent geolocation samples; specify resolution')
        values.append(float(np.median(good)))
    result=min(values)
    if not 1e-6<result<5: raise ValueError('Unreliable inferred resolution; specify resolution')
    return result

def nc_array(ds,name,slices=None):
    v=ds[name]; select=[]
    for i,dim in enumerate(v.dimensions):
        if i<len(v.dimensions)-2:
            if dim in (slices or {}): select.append(int(slices[dim]))
            elif v.shape[i]==1: select.append(0)
            else: raise ValueError(f'{name}: select extra dimension {dim} using --slice {dim}=INDEX')
        else: select.append(slice(None))
    a=np.ma.asarray(v[tuple(select)],dtype=np.float64)
    data=np.asarray(a.filled(np.nan))
    if data.ndim!=2: raise ValueError(f'{name} must resolve to a 2D raster')
    attrs={k:v.getncattr(k) for k in v.ncattrs()}
    # netCDF4 already applies fill masks, valid range and scale/offset.
    data[~np.isfinite(data)]=np.nan
    return data,attrs

def write_tiff(path,arr,typ=gdal.GDT_Float32):
    d=gdal.GetDriverByName('GTiff').Create(str(path),arr.shape[1],arr.shape[0],1,typ)
    d.GetRasterBand(1).WriteArray(arr);d.FlushCache();return d

def prepare_nc(path,cfg,tmp):
    with Dataset(path) as ds:
        a,attrs=nc_array(ds,cfg['variable'],cfg.get('slices'))
        latname=cfg.get('lat');lonname=cfg.get('lon')
        if not latname or not lonname:
            latname=next((n for n in ['lat','latitude','Latitude'] if n in ds.variables),None)
            lonname=next((n for n in ['lon','longitude','Longitude'] if n in ds.variables),None)
        if not latname or not lonname: raise ValueError('NC requires lat/lon coordinate paths')
        lat=np.ma.asarray(ds[latname][:],dtype=float).filled(np.nan)
        lon=np.ma.asarray(ds[lonname][:],dtype=float).filled(np.nan)
        if cfg.get('qa'):
            q,_=nc_array(ds,cfg['qa']['variable'],cfg.get('slices'))
            mask=np.isfinite(q)
            if 'allowed_values' in cfg['qa']: mask &= np.isin(q,cfg['qa']['allowed_values'])
            if 'reject_bits' in cfg['qa']: mask &= (np.nan_to_num(q).astype(np.int64)&int(cfg['qa']['reject_bits']))==0
            a[~mask]=np.nan
        if cfg['type']=='categorical':
            valid=np.array([int(k) for k in cfg['classes']]);a[~np.isin(a,valid)]=np.nan
        nodata=-9999 if cfg['type']=='categorical' else NODATA
        wkt=osr.SpatialReference();wkt.ImportFromEPSG(4326)
        src=write_tiff(tmp/'source.tif',np.where(np.isfinite(a),a,nodata),gdal.GDT_Int32 if cfg['type']=='categorical' else gdal.GDT_Float32)
        src.GetRasterBand(1).SetNoDataValue(nodata)
        if lat.ndim==lon.ndim==1:
            if a.shape!=(len(lat),len(lon)):raise ValueError('coordinate dimensions do not match raster')
            dx=np.diff(lon);dy=np.diff(lat)
            if not(len(dx) and len(dy) and np.allclose(dx,dx[0],rtol=1e-3) and np.allclose(dy,dy[0],rtol=1e-3) and dx[0]!=0 and dy[0]!=0):raise ValueError('1D coordinates must be regular')
            src.SetGeoTransform((float(lon[0]-dx[0]/2),float(dx[0]),0,float(lat[0]-dy[0]/2),0,float(dy[0])))
            src.SetProjection(wkt.ExportToWkt());res=cfg.get('resolution') or min(abs(float(dx[0])),abs(float(dy[0])))
            geoloc=False
        elif lat.ndim==lon.ndim==2 and lat.shape==lon.shape==a.shape:
            good=np.isfinite(lat)&np.isfinite(lon)&(abs(lat)<=90)&(abs(lon)<=180)
            lat=np.where(good,lat,np.nan);lon=np.where(good,lon,np.nan)
            a[~good]=np.nan;src.GetRasterBand(1).WriteArray(np.where(np.isfinite(a),a,nodata))
            res=cfg.get('resolution') or resolution_from_geolocation(lon,lat)
            for name,arr in [('lon',lon),('lat',lat)]:
                d=write_tiff(tmp/f'{name}.tif',np.where(np.isfinite(arr),arr,-9999),gdal.GDT_Float64);d.GetRasterBand(1).SetNoDataValue(-9999);d=None
            src.SetMetadata({'SRS':wkt.ExportToWkt(),'X_DATASET':str(tmp/'lon.tif'),'X_BAND':'1','Y_DATASET':str(tmp/'lat.tif'),'Y_BAND':'1','PIXEL_OFFSET':'0','LINE_OFFSET':'0','PIXEL_STEP':'1','LINE_STEP':'1','GEOREFERENCING_CONVENTION':'PIXEL_CENTER'},'GEOLOCATION');geoloc=True
        else: raise ValueError('Unsupported coordinate shape')
        if geoloc:
            src.SetMetadataItem('XBAER_BOUNDS',json.dumps([float(np.nanmin(lon)-res/2),float(np.nanmin(lat)-res/2),float(np.nanmax(lon)+res/2),float(np.nanmax(lat)+res/2)]))
        src.FlushCache()
        return src,float(res),geoloc,attrs,nodata

def validate_cog(path):
    d=gdal.Open(str(path))
    if not d or d.GetMetadataItem('LAYOUT','IMAGE_STRUCTURE')!='COG':raise ValueError('Not a COG')
    if d.GetRasterBand(1).GetNoDataValue() is None or not d.GetProjection():raise ValueError('Missing NoData or CRS')
    if max(d.RasterXSize,d.RasterYSize)>512 and not d.GetRasterBand(1).GetOverviewCount():raise ValueError('Missing overviews')
    return d

def convert(path,cfg,tmp):
    categorical=cfg['type']=='categorical';geoloc=False
    if Path(path).suffix.lower() in ['.nc','.nc4','.cdf']:
        src,res,geoloc,attrs,nodata=prepare_nc(path,cfg,tmp);crs='EPSG:4326'
    else:
        original=gdal.Open(str(path));band=int(cfg.get('band',1))
        if not original or not original.GetProjection() or original.GetGeoTransform(can_return_null=True) is None:raise ValueError('TIF requires georeferencing')
        if band<1 or band>original.RasterCount:raise ValueError('Invalid band')
        b=original.GetRasterBand(band);a=b.ReadAsArray().astype(float);nd=b.GetNoDataValue()
        if nd is not None:a[a==nd]=np.nan
        a=a*(b.GetScale() if b.GetScale() is not None else 1)+(b.GetOffset() or 0)
        if categorical:a[~np.isin(a,[int(k) for k in cfg['classes']])]=np.nan
        nodata=-9999 if categorical else NODATA
        src=write_tiff(tmp/'source.tif',np.where(np.isfinite(a),a,nodata),gdal.GDT_Int32 if categorical else gdal.GDT_Float32)
        src.SetProjection(original.GetProjection());src.SetGeoTransform(original.GetGeoTransform());src.GetRasterBand(1).SetNoDataValue(nodata)
        res=cfg.get('resolution');crs=cfg.get('crs') or original.GetProjection();attrs={}
    opts=dict(format='GTiff',dstSRS=crs,resampleAlg='near',srcNodata=nodata,dstNodata=nodata,geoloc=geoloc,creationOptions=['TILED=YES','COMPRESS=DEFLATE'],multithread=True)
    if res:opts.update(xRes=res,yRes=res)
    if geoloc:opts.update(outputBounds=json.loads(src.GetMetadataItem('XBAER_BOUNDS')),targetAlignedPixels=True)
    warped=gdal.Warp(str(tmp/'warped.tif'),src,**opts)
    data=warped.GetRasterBand(1).ReadAsArray();values=data[np.isfinite(data)&(data!=nodata)]
    if not values.size:raise ValueError('No valid pixels after conversion')
    cog=tmp/'final.tif'
    gdal.Translate(str(cog),warped,format='COG',creationOptions=['BLOCKSIZE=512','COMPRESS=DEFLATE','OVERVIEW_RESAMPLING='+('NEAREST' if categorical else 'AVERAGE'),'NUM_THREADS=ALL_CPUS'])
    d=validate_cog(cog);gt=d.GetGeoTransform()
    srs=osr.SpatialReference(wkt=d.GetProjection());srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    ll=osr.SpatialReference();ll.ImportFromEPSG(4326);ll.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    tr=osr.CoordinateTransformation(srs,ll)
    corners=[tr.TransformPoint(gt[0]+x*gt[1]+y*gt[2],gt[3]+x*gt[4]+y*gt[5]) for x,y in [(0,0),(d.RasterXSize,0),(0,d.RasterYSize),(d.RasterXSize,d.RasterYSize)]]
    bounds=[min(p[0] for p in corners),min(p[1] for p in corners),max(p[0] for p in corners),max(p[1] for p in corners)]
    info={'bounds':bounds,'resolution':[abs(gt[1]),abs(gt[5])],'crs':d.GetProjection(),'projection':{'code':('EPSG:'+srs.GetAuthorityCode(None)) if srs.GetAuthorityCode(None) else 'XBAER:'+hashlib.sha256(d.GetProjection().encode()).hexdigest()[:12],'definition':srs.ExportToProj4()},'width':d.RasterXSize,'height':d.RasterYSize,'nodata':nodata,'validPixels':int(values.size),'valueRange':[float(values.min()),float(values.max())]}
    d=None;warped=None;src=None
    return cog,info

def publish_product(paths,cfg,output,overwrite=False):
    product=cfg['product']
    if not re.fullmatch(r'[a-zA-Z0-9_-]+',product):raise ValueError('Invalid product directory')
    out=Path(output)/product;out.mkdir(parents=True,exist_ok=True)
    indexpath=out/'index.json';old=json.loads(indexpath.read_text()) if indexpath.exists() else {}
    entries={e['datetime']:e for e in old.get('files',[])}
    for path in sorted(paths):
        stamp=timestamp(path,cfg.get('datetime'))
        fingerprint=hashlib.sha256(Path(path).read_bytes()+json.dumps(cfg,sort_keys=True).encode()+PIPELINE_VERSION.encode()).hexdigest()
        prev=entries.get(stamp)
        if prev and prev.get('fingerprint')==fingerprint and (out/prev['file']).exists():print('SKIP',Path(path).name);continue
        if prev and not overwrite:raise ValueError(f'{stamp} already exists with different input/config; use --overwrite')
        with tempfile.TemporaryDirectory(prefix='xbaer-') as work:
            cog,info=convert(path,cfg,Path(work))
            filename=f"{product}_{stamp.replace('-','').replace(':','')}_{fingerprint[:12]}.tif"
            # stage inside target filesystem; expose only a fully written final COG.
            import shutil
            stage=out/(filename+'.tmp');shutil.copyfile(cog,stage);os.replace(stage,out/filename)
        entries[stamp]={'datetime':stamp,'file':filename,'fingerprint':fingerprint,**info}
        print('COG',filename,info['width'],info['height'])
    index={k:v for k,v in cfg.items() if k in ['id','name','type','unit','classes','source','sourceLabel','badge','owner','min','max']}
    index.update(schemaVersion=1,files=sorted(entries.values(),key=lambda e:e['datetime']),processing={'resampling':'nearest','overviewResampling':'nearest' if cfg['type']=='categorical' else 'average','resolutionPolicy':'configured' if cfg.get('resolution') else 'native-or-estimated','qa':cfg.get('qa','basic-validity'),'variable':cfg.get('variable'),'slices':cfg.get('slices',{})})
    if cfg['type']=='continuous':
        if ('min' in cfg)!=('max' in cfg):raise ValueError('Provide both min and max')
        if 'min' not in cfg:
            values=[]
            for e in index['files']:
                d=gdal.Open(str(out/e['file']));a=d.ReadAsArray();values.append(a[np.isfinite(a)&(a!=e['nodata'])]);d=None
            low,high=np.percentile(np.concatenate(values),cfg.get('percentiles',[2,98]));index.update(min=float(low),max=float(high if high>low else low+1))
        if not index['max']>index['min']:raise ValueError('max must exceed min')
    atomic_json(indexpath,index)
    catalogpath=Path(output)/'catalog.json';catalog=json.loads(catalogpath.read_text()) if catalogpath.exists() else {'schemaVersion':1,'layers':[]}
    entry={k:index[k] for k in ['id','name','type','unit','source','sourceLabel','badge','owner'] if k in index};entry['index']=product+'/index.json'
    catalog['layers']=[x for x in catalog['layers'] if x['id']!=entry['id']]+[entry];atomic_json(catalogpath,catalog)
    return index

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input');p.add_argument('--output');p.add_argument('--deployment');p.add_argument('--member');p.add_argument('--dry-run',action='store_true');p.add_argument('--config');p.add_argument('--input-root',default='.');p.add_argument('--product');p.add_argument('--variable');p.add_argument('--lat');p.add_argument('--lon');p.add_argument('--band',type=int,default=1);p.add_argument('--slice',action='append',default=[]);p.add_argument('--resolution',type=float);p.add_argument('--crs');p.add_argument('--datetime');p.add_argument('--min',type=float);p.add_argument('--max',type=float);p.add_argument('--overwrite',action='store_true');args=p.parse_args()
    member=None
    if args.deployment:
        if not args.member:p.error('--member is required with --deployment')
        if args.output or args.input_root!='.':p.error('Use configured paths; do not combine --deployment with --output/--input-root')
        member=member_paths(load_deployment(args.deployment),args.member)
        args.input_root=member['resultsRoot'];args.output=member['publishRoot']
    elif not args.output:p.error('--output is required without --deployment')
    if args.config:
        for cfg in json.loads(Path(args.config).read_text())['products']:
            cfg=dict(cfg)
            pattern=cfg['input']
            if member:
                if Path(pattern).is_absolute() or '..' in Path(pattern).parts:raise ValueError('Product input must be relative to configured resultsRoot')
                cfg['owner']=args.member
                cfg['id']=args.member+':'+cfg['id'] if not cfg['id'].startswith(args.member+':') else cfg['id']
            if args.dry_run:
                print(json.dumps({'member':args.member,'input':str(Path(args.input_root)/pattern),'output':str(Path(args.output)/cfg['product']),'id':cfg['id']},ensure_ascii=False));continue
            paths=glob.glob(str(Path(args.input_root)/pattern))
            if not paths:raise ValueError('No inputs for '+cfg['product'])
            publish_product(paths,cfg,args.output,args.overwrite)
    else:
        if not args.input or not args.product:p.error('--input and --product required without --config')
        cfg={k:v for k,v in vars(args).items() if v is not None and k in ['product','variable','lat','lon','band','resolution','crs','datetime','min','max']};cfg.update(id=args.product,name={'zh':args.product,'en':args.product},type='continuous',unit='',owner='local',source=Path(args.input).name,slices=dict(x.split('=',1) for x in args.slice))
        if member:
            if Path(args.input).is_absolute() or '..' in Path(args.input).parts:raise ValueError('--input must be relative to configured resultsRoot')
            args.input=str(Path(args.input_root)/args.input)
            cfg['owner']=args.member;cfg['id']=args.member+':'+cfg['id']
        if args.dry_run:
            print(json.dumps({'input':args.input,'output':str(Path(args.output)/args.product)}));return
        paths=sorted(str(x) for x in Path(args.input).iterdir() if x.suffix.lower() in ['.nc','.nc4','.tif','.tiff']) if Path(args.input).is_dir() else glob.glob(args.input)
        if not paths:raise ValueError('No inputs matched')
        publish_product(paths,cfg,args.output,args.overwrite)
if __name__=='__main__':main()
