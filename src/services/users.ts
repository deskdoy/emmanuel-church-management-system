import { supabase } from "../lib/supabase";
import type { ManagedUser, Role, RoleName, UserAccessUpdate } from "../types";

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

const relation = (value:unknown) => Array.isArray(value) ? value[0] : value;

export async function loadManagedUsers():Promise<{users:ManagedUser[];roles:Role[]}> {
  const db=client();
  const [usersResult,rolesResult]=await Promise.all([
    db.from("users").select("id,email,full_name,role_id,is_active,roles(name)").order("full_name"),
    db.from("roles").select("id,name,description,created_at").order("name"),
  ]);
  if(usersResult.error)throw new Error(`Unable to load users: ${usersResult.error.message}`);
  if(rolesResult.error)throw new Error(`Unable to load roles: ${rolesResult.error.message}`);
  const users=(usersResult.data||[]).map(row=>{
    const role=relation(row.roles) as {name?:unknown}|null;
    return{id:row.id,email:row.email,fullName:row.full_name,role:String(role?.name||"Viewer") as RoleName,roleId:row.role_id,isActive:row.is_active};
  });
  const roles=(rolesResult.data||[]).map(row=>({id:row.id,name:row.name as RoleName,description:row.description,createdAt:row.created_at}));
  return{users,roles};
}

export async function updateUserAccess(update:UserAccessUpdate) {
  const db=client();
  const {data:authData,error:authError}=await db.auth.getUser();
  if(authError||!authData.user)throw new Error(authError?.message||"Your session has expired.");
  const [targetResult,roleResult]=await Promise.all([
    db.from("users").select("id,is_active,roles(name)").eq("id",update.userId).single(),
    db.from("roles").select("id,name").eq("id",update.roleId).single(),
  ]);
  if(targetResult.error)throw new Error(`Unable to verify the user: ${targetResult.error.message}`);
  if(roleResult.error)throw new Error(`Unable to verify the role: ${roleResult.error.message}`);
  if(update.userId===authData.user.id&&roleResult.data.name!=="Admin")throw new Error("You cannot remove your own Admin role.");
  if(update.userId===authData.user.id&&!update.isActive)throw new Error("You cannot disable your own account.");
  const {error}=await db.from("users").update({role_id:update.roleId,is_active:update.isActive}).eq("id",update.userId).select("id").single();
  if(error)throw new Error(error.message);
}
