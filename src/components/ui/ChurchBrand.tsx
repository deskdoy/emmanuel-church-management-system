import { AppIcon } from "./AppIcon";
import { BRAND } from "../../branding";

export function ChurchBrand({compact=false,inverse=false}:{compact?:boolean;inverse?:boolean}){
  return <div className={`church-brand ${compact?"compact":""} ${inverse?"inverse":""}`}><span className="church-logo-placeholder" aria-label="Faithful Steward logo placeholder"><AppIcon name="church" size={compact?20:26}/></span><span className="church-brand-copy"><b>{BRAND.productName}</b><small>{BRAND.subtitle}</small></span></div>;
}
