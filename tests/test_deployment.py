import unittest,tempfile,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from deployment_config import load_deployment,member_paths,frontend_config
from configure_deployment import nginx_config
class DeploymentTests(unittest.TestCase):
 def test_paths_and_public_urls(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'deployment.json';p.write_text(json.dumps({'platformRoot':'/home/admin1/xbaer-view','members':{'alice':{'resultsRoot':'/data_hdd/alice/results','publishRoot':'/data_ssd/alice/publish','publishUrl':'/data/members/alice/'}},'basemap':{'sourceRoot':'/data_hdd/xbaer-view/basemap-source','publishRoot':'/data_ssd/xbaer-view/publish/basemap','url':'/data/basemap/'}}))
   cfg=load_deployment(p);self.assertEqual(member_paths(cfg,'alice')['publishRoot'],'/data_ssd/alice/publish')
   public=frontend_config(cfg);self.assertEqual(public['basemapRoot'],'/data/basemap/');self.assertNotIn('/data_ssd',json.dumps(public));self.assertNotIn('/data_hdd',nginx_config(cfg));self.assertIn('/home/admin1/xbaer-view/dist',nginx_config(cfg))
   with self.assertRaises(ValueError):member_paths(cfg,'alice_data')
if __name__=='__main__':unittest.main()
