#!/usr/bin/env python3
"""Produce one compact GeoJSON per Natural Earth source; preserve original Shapefiles."""
import argparse,json,os,tempfile
from pathlib import Path
from osgeo import ogr,osr
from deployment_config import load_deployment
LAYERS={'countries':'admin_0_countries','provinces':'admin_1_states_provinces','cities':'populated_places','coastline':'coastline','rivers':'rivers_lake_centerlines_scale_rank','lakes':'lakes'}
FIELDS={'name','name_en','name_zh','nameascii','scalerank','labelrank','min_zoom','min_label','max_label','featurecla','adm0_a3','adm1_code','iso_a2','iso_a3','iso_3166_2','admin','adm0name','adm1name','adm0cap','sov_a3','strokeweig','label_x','label_y','ne_id'}
def rounded(obj):
    if isinstance(obj,float):return round(obj,5)
    if isinstance(obj,list):return [rounded(x) for x in obj]
    if isinstance(obj,dict):return {k:rounded(v) for k,v in obj.items()}
    return obj

def main():
    p=argparse.ArgumentParser();p.add_argument('--input');p.add_argument('--output');p.add_argument('--deployment');p.add_argument('--dry-run',action='store_true');a=p.parse_args()
    if a.deployment:
        if a.input or a.output:p.error('Use configured basemap paths with --deployment')
        cfg=load_deployment(a.deployment)['basemap'];a.input=cfg['sourceRoot'];a.output=cfg['publishRoot']
    if not a.input or not a.output:p.error('--deployment or both --input/--output required')
    if a.dry_run:print(json.dumps({'input':a.input,'output':a.output}));return
    out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
    manifest=[]
    for kind,suffix in LAYERS.items():
        paths=list(Path(a.input).rglob('ne_10m_'+suffix+'.shp'))
        if len(paths)!=1:raise ValueError(f'Expected one {suffix} shapefile')
        ds=ogr.Open(str(paths[0]));layer=ds.GetLayer();src=layer.GetSpatialRef();src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        target=osr.SpatialReference();target.ImportFromEPSG(4326);target.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER);tr=osr.CoordinateTransformation(src,target)
        features=[]
        for f in layer:
            geometry=f.GetGeometryRef()
            if geometry is None:continue
            geometry=geometry.Clone();geometry.Transform(tr)
            props={k.lower():v for k,v in f.items().items() if k.lower() in FIELDS and v is not None}
            features.append({'type':'Feature','id':f.GetFID(),'properties':props,'geometry':rounded(json.loads(geometry.ExportToJson()))})
        content={'type':'FeatureCollection','name':kind,'features':features}
        file=out/(kind+'.geojson');fd,tmp=tempfile.mkstemp(dir=out)
        with os.fdopen(fd,'w') as stream:json.dump(content,stream,ensure_ascii=False,separators=(',',':'))
        os.replace(tmp,file);manifest.append({'id':kind,'file':file.name,'features':len(features),'bytes':file.stat().st_size});print(kind,len(features),file.stat().st_size)
    (out/'manifest.json').write_text(json.dumps({'source':'Natural Earth 1:10m','license':'Public domain','layers':manifest},indent=2))
if __name__=='__main__':main()
