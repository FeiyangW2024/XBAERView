#!/usr/bin/env python3
"""Generate reviewable frontend URL config and nginx config locally. Never deploys."""
import argparse,json
from pathlib import Path
from deployment_config import load_deployment,frontend_config

def nginx_config(cfg):
    def quote(s):return '"'+s.replace('\\','\\\\').replace('"','\\"').replace('$','\\$')+'"'
    aliases=[(m['publishUrl'],m['publishRoot']) for m in cfg['members'].values()]+[(cfg['basemap']['url'],cfg['basemap']['publishRoot'])]
    if len({u for u,_ in aliases})!=len(aliases):raise ValueError('Duplicate nginx URL aliases')
    text='''# Generated from deployment configuration; review before installing on Linux.
server {
    listen 8080;
    server_name _;
    root PLATFORM_DIST;
    index index.html;
    sendfile on;
    gzip on;
    gzip_types application/json application/geo+json text/css application/javascript;
    gzip_min_length 1024;
    location / { try_files $uri $uri/ /index.html; }
    location = /config.json { add_header Cache-Control "no-cache"; }
'''.replace('PLATFORM_DIST',quote(str(Path(cfg['platformRoot'])/'dist')))
    for url,folder in aliases:
        text+=f'''    location ^~ {quote(url)} {{
        alias {quote(folder.rstrip('/')+'/')};
        autoindex off;
        limit_except GET {{ deny all; }}
        types {{ application/json json geojson; image/tiff tif tiff; }}
        default_type application/octet-stream;
        add_header Cache-Control "no-cache";
    }}
'''
    return text+'}\n'

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--deployment',required=True);p.add_argument('--output-dir',required=True);a=p.parse_args()
    cfg=load_deployment(a.deployment);out=Path(a.output_dir);out.mkdir(parents=True,exist_ok=True)
    (out/'config.json').write_text(json.dumps(frontend_config(cfg),ensure_ascii=False,indent=2)+'\n')
    (out/'nginx.conf').write_text(nginx_config(cfg))
    print('Generated local configuration in',out)
if __name__=='__main__':main()
