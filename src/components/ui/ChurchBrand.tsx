import { AppIcon } from "./AppIcon";

export function ChurchBrand({compact=false,inverse=false}:{compact?:boolean;inverse?:boolean}){
  return <div className={`church-brand ${compact?"compact":""} ${inverse?"inverse":""}`}><span className="church-logo-placeholder" aria-label="Church logo placeholder"><AppIcon name="church" size={compact?20:26}/></span><span className="church-brand-copy"><small>Emmanuel Church</small><b>Cash Flow</b></span></div>;
}
