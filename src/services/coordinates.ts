export function formatCoordinate(value:number,latitude:boolean,decimal:boolean):string {
 const direction=latitude?(value<0?'S':'N'):(value<0?'W':'E');
 if(decimal)return `${Math.abs(value).toFixed(4)}° ${direction}`;
 const total=Math.round(Math.abs(value)*3600), degrees=Math.floor(total/3600), minutes=Math.floor(total%3600/60), seconds=total%60;
 return `${degrees}°${String(minutes).padStart(2,'0')}′${String(seconds).padStart(2,'0')}″ ${direction}`;
}
