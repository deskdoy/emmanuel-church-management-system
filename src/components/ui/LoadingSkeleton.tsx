export function LoadingSkeleton({rows=3,label="Loading content"}:{rows?:number;label?:string}){
  return <div className="skeleton-stack" role="status" aria-label={label}>{Array.from({length:rows},(_,index)=><div className="skeleton-row" key={index}><i/><span><b/><b/></span></div>)}<span className="sr-only">{label}…</span></div>;
}
