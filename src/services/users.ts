import { supabase } from "../lib/supabase";
import type { ManagedUser, Role, RoleName, UserAccessUpdate } from "../types";

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

const relation = (value:unknown) => Array.isArray(value) ? value[0] : value;

export async function loadManagedUsers(churchId:string):Promise<{users:ManagedUser[];roles:Role[]}> {
  const db=client();
  const [usersResult,rolesResult]=await Promise.all([
    db.from("church_memberships").select("id,user_id,role_id,status,roles(name),users(id,email,full_name,is_active)").eq("church_id",churchId).order("created_at"),
    db.from("roles").select("id,name,description,created_at").order("name"),
  ]);
  if(usersResult.error)throw new Error(`Unable to load users: ${usersResult.error.message}`);
  if(rolesResult.error)throw new Error(`Unable to load roles: ${rolesResult.error.message}`);
  const users=(usersResult.data||[]).flatMap(row=>{
    const role=relation(row.roles) as {name?:unknown}|null;
    const user=relation(row.users) as {id?:unknown;email?:unknown;full_name?:unknown;is_active?:unknown}|null;
    return user?[{membershipId:row.id,id:String(user.id||row.user_id),email:String(user.email||""),fullName:String(user.full_name||""),role:String(role?.name||"Viewer") as RoleName,roleId:row.role_id,isActive:row.status==="active"&&user.is_active===true}]:[];
  });
  const roles=(rolesResult.data||[]).map(row=>({id:row.id,name:row.name as RoleName,description:row.description,createdAt:row.created_at}));
  return{users,roles};
}

export async function updateUserAccess(churchId:string,update:UserAccessUpdate) {
  const db=client();
  const {data:authData,error:authError}=await db.auth.getUser();
  if(authError||!authData.user)throw new Error(authError?.message||"Your session has expired.");
  const [targetResult,roleResult]=await Promise.all([
    db.from("church_memberships").select("id,user_id,status,roles(name)").eq("id",update.membershipId).eq("church_id",churchId).single(),
    db.from("roles").select("id,name").eq("id",update.roleId).single(),
  ]);
  if(targetResult.error)throw new Error(`Unable to verify the user: ${targetResult.error.message}`);
  if(roleResult.error)throw new Error(`Unable to verify the role: ${roleResult.error.message}`);
  if(update.userId===authData.user.id&&roleResult.data.name!=="Admin")throw new Error("You cannot remove your own Church Admin role.");
  if(update.userId===authData.user.id&&!update.isActive)throw new Error("You cannot deactivate your own church membership.");
  const {error}=await db.rpc("update_church_membership_access",{p_church_id:churchId,p_membership_id:update.membershipId,p_role_id:update.roleId,p_status:update.isActive?"active":"inactive"});
  if(error)throw new Error(error.message);
}
