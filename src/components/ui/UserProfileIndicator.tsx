import type { RoleName } from "../../types";

const initials=(name:string,email:string)=>{
  const source=name.trim()||email.split("@")[0]||"User";
  return source.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();
};

export function UserProfileIndicator({name,email,role,compact=false}:{name:string;email:string;role:RoleName|"Platform Owner";compact?:boolean}){
  return <div className={`user-profile-indicator ${compact?"compact":""}`}><span className="user-avatar" aria-hidden="true">{initials(name,email)}</span><span className="user-profile-copy"><b>{name||email}</b><small>{role}</small></span></div>;
}
