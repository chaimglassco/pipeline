export default function Loading(){return<div className="page"><div className="skeleton wide"/><div className="skeleton-grid">{[1,2,3].map(x=><div className="skeleton" key={x}/>)}</div></div>}
