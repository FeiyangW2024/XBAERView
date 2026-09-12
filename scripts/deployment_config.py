"""Filesystem paths belong to deployment configuration, never frontend source."""
import json
from pathlib import Path

def load_deployment(path):
    path=Path(path).resolve();cfg=json.loads(path.read_text())
    def resolved(value):
        p=Path(value).expanduser()
        return str(p.resolve() if p.is_absolute() else (path.parent/p).resolve())
    for field in ['platformRoot']:
        cfg[field]=resolved(cfg[field])
    for key,member in cfg['members'].items():
        if not key or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in key):raise ValueError('Invalid logical member key')
        for field in ['resultsRoot','publishRoot']:member[field]=resolved(member[field])
        if not member['publishUrl'].startswith('/') or not member['publishUrl'].endswith('/'):raise ValueError('publishUrl must be an absolute same-origin directory URL ending in /')
        if Path(member['resultsRoot'])==Path(member['publishRoot']):raise ValueError('resultsRoot and publishRoot must differ')
    for field in ['sourceRoot','publishRoot']:cfg['basemap'][field]=resolved(cfg['basemap'][field])
    if not cfg['basemap']['url'].startswith('/') or not cfg['basemap']['url'].endswith('/'):raise ValueError('basemap URL must be an absolute directory URL')
    return cfg

def member_paths(cfg,key):
    if key not in cfg['members']:raise ValueError(f'Unknown member: {key}; configure members explicitly')
    return cfg['members'][key]

def frontend_config(cfg):
    return {'members':{key:{'catalogUrl':m['publishUrl']+'catalog.json'} for key,m in cfg['members'].items()},'basemapRoot':cfg['basemap']['url'],'rasterCacheSize':4,'rgbBasemapUrl':None}
