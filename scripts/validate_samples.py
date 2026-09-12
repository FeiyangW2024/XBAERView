#!/usr/bin/env python3
import argparse,json,sys,urllib.request
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
from netCDF4 import Dataset
from osgeo import gdal
from publish import validate_cog

def main():
 p=argparse.ArgumentParser();p.add_argument('--input-root',default='../test data');p.add_argument('--publish',default='../test data/publish');p.add_argument('--url',default='http://127.0.0.1:8765/');p.add_argument('--report',default='validation.json');a=p.parse_args();root=Path(a.publish);report=[]
 cfg=json.loads(Path('config/products.json').read_text())
 for product in cfg['products']:
  index=json.loads((root/product['product']/'index.json').read_text())
  paths={x.name:x for x in Path(a.input_root).glob(product['input'])}
  for entry in index['files']:
   d=validate_cog(root/product['product']/entry['file']);raster=d.ReadAsArray();good=np.isfinite(raster)&(raster!=entry['nodata']);assert int(good.sum())==entry['validPixels'];assert d.GetRasterBand(1).GetBlockSize()==[512,512]
   if product['type']=='categorical':assert set(np.unique(raster[good]))<=set(map(int,product['classes']))
   stamp=entry['datetime'].replace('-','').replace(':','');srcpath=next(path for name,path in paths.items() if stamp[:8]+'_'+stamp[9:13] in name)
   with Dataset(srcpath) as nc:
    lon=np.ma.asarray(nc[product['lon']][:]).filled(np.nan);lat=np.ma.asarray(nc[product['lat']][:]).filled(np.nan);values=np.ma.asarray(nc[product['variable']][:],dtype=float).filled(np.nan)
   valid=np.isfinite(lon)&np.isfinite(lat)&np.isfinite(values)&(abs(lat)<=90)&(abs(lon)<=180)
   tree=cKDTree(np.column_stack((lon[valid],lat[valid])));sourcevalues=values[valid]
   yy,xx=np.where(good);sel=np.linspace(0,len(xx)-1,80,dtype=int);xx=xx[sel];yy=yy[sel];gt=d.GetGeoTransform();points=np.column_stack((gt[0]+(xx+.5)*gt[1],gt[3]+(yy+.5)*gt[5]));distance,near=tree.query(points,k=9);match=np.any(sourcevalues[near]==raster[yy,xx,None],axis=1);assert match.mean()>.9,(entry['file'],match.mean())
   req=urllib.request.Request(a.url+product['product']+'/'+entry['file'],headers={'Range':'bytes=0-1023'})
   with urllib.request.urlopen(req) as r:assert r.status==206 and len(r.read())==1024 and r.headers['Content-Range'].startswith('bytes 0-1023/')
   report.append({'file':entry['file'],'size':[d.RasterXSize,d.RasterYSize],'validPixels':int(good.sum()),'overviews':d.GetRasterBand(1).GetOverviewCount(),'sourceNeighborhoodAgreement':float(match.mean()),'httpRange':206});print(entry['file'],float(match.mean()))
 Path(a.report).write_text(json.dumps(report,indent=2));print('Validated',len(report),'COGs')
if __name__=='__main__':main()
