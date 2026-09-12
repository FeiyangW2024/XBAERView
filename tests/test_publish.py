import sys,tempfile,unittest,json
from pathlib import Path
import numpy as np
from netCDF4 import Dataset
from osgeo import gdal,osr
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from publish import publish_product,convert,resolution_from_geolocation,validate_cog,timestamp
class PublishTests(unittest.TestCase):
 def setUp(self):self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
 def tearDown(self):self.temp.cleanup()
 def nc(self,name='sample_20230101_0000.nc',extra=False,swath=False):
  path=self.root/name
  with Dataset(path,'w') as d:
   d.createDimension('y',20);d.createDimension('x',30)
   if extra:d.createDimension('band',2)
   lat=d.createVariable('lat','f8',('y','x') if swath else ('y',));lon=d.createVariable('lon','f8',('y','x') if swath else ('x',))
   y,x=np.mgrid[:20,:30];lat[:]=40-y*.1 if swath else 40-np.arange(20)*.1;lon[:]=100+x*.1 if swath else 100+np.arange(30)*.1
   v=d.createVariable('v','f4',('band','y','x') if extra else ('y','x'),fill_value=-9999);v[:]=np.arange(600).reshape(20,30);v[...,0,0]=-9999
  return path
 def cfg(self):return dict(id='test',product='test',name={'zh':'测试','en':'Test'},type='continuous',unit='K',variable='v',lat='lat',lon='lon',owner='local',source='test')
 def test_regular_fixed_range_idempotent_and_failure(self):
  p=self.nc();cfg=self.cfg()|{'min':0,'max':1000};out=self.root/'publish';index=publish_product([p],cfg,out);f=out/'test'/index['files'][0]['file'];self.assertEqual(index['max'],1000);self.assertEqual(index['files'][0]['validPixels'],599);validate_cog(f);modified=f.stat().st_mtime_ns;publish_product([p],cfg,out);self.assertEqual(modified,f.stat().st_mtime_ns)
  before=(out/'test/index.json').read_bytes()
  with self.assertRaises(Exception):publish_product([p],cfg|{'variable':'missing'},out,True)
  self.assertEqual(before,(out/'test/index.json').read_bytes())
 def test_swath_resolution_and_bounds(self):
  p=self.nc(swath=True);tmp=self.root/'work';tmp.mkdir();_,info=convert(p,self.cfg(),tmp);self.assertAlmostEqual(info['resolution'][0],.1,places=6);self.assertLess(info['bounds'][0],100);self.assertGreater(info['bounds'][2],102.9)
 def test_extra_dimension_requires_slice(self):
  p=self.nc(extra=True);tmp=self.root/'work';tmp.mkdir()
  with self.assertRaises(ValueError):convert(p,self.cfg(),tmp)
  convert(p,self.cfg()|{'slices':{'band':1}},tmp)
 def test_tiff_and_percentiles(self):
  p=self.root/'test_20230101_0100.tif';d=gdal.GetDriverByName('GTiff').Create(str(p),30,20,1,gdal.GDT_Float32);srs=osr.SpatialReference();srs.ImportFromEPSG(4326);d.SetProjection(srs.ExportToWkt());d.SetGeoTransform((100,.1,0,40,0,-.1));d.GetRasterBand(1).WriteArray(np.arange(600).reshape(20,30));d=None
  idx=publish_product([p],self.cfg(),self.root/'publish');self.assertAlmostEqual(idx['min'],11.98,places=2);self.assertAlmostEqual(idx['max'],587.02,places=2)
 def test_bad_coordinates(self):
  with self.assertRaises(ValueError):resolution_from_geolocation(np.full((20,30),np.nan),np.full((20,30),np.nan))
  with self.assertRaises(ValueError):timestamp('no_time.nc')
if __name__=='__main__':unittest.main()
