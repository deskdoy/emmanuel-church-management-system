import { supabase } from "../lib/supabase";
import type { Church, ChurchMembership, ChurchMembershipStatus, ChurchStatus, PlatformRoleAssignment, RoleName } from "../types";

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

const related = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] || null : value;

export async function loadTenancyAuthorization(userId:string):Promise<{memberships:ChurchMembership[];platformRoles:PlatformRoleAssignment[]}> {
  const db=client();
  const [membershipsResult,platformRolesResult]=await Promise.all([
    db.from("church_memberships")
      .select("id,church_id,user_id,role_id,status,joined_at,created_at,updated_at,churches(id,name,slug,address,logo_url,status,timezone,currency,created_at,updated_at),roles(id,name)")
      .eq("user_id",userId)
      .order("created_at"),
    db.from("platform_user_roles")
      .select("user_id,platform_role_id,is_active,created_at,updated_at,platform_roles(id,code,name,created_at)")
      .eq("user_id",userId),
  ]);
  if(membershipsResult.error)throw new Error(`Unable to load church access: ${membershipsResult.error.message}`);
  if(platformRolesResult.error)throw new Error(`Unable to load platform access: ${platformRolesResult.error.message}`);

  const memberships=(membershipsResult.data||[]).flatMap(row=>{
    const churchRow=related(row.churches),roleRow=related(row.roles);
    if(!churchRow||!roleRow)return [];
    const church:Church={
      id:churchRow.id,name:churchRow.name,slug:churchRow.slug,address:churchRow.address||"",logoUrl:churchRow.logo_url,
      status:churchRow.status as ChurchStatus,timezone:churchRow.timezone,currency:churchRow.currency,
      createdAt:churchRow.created_at,updatedAt:churchRow.updated_at,
    };
    return [{
      id:row.id,churchId:row.church_id,userId:row.user_id,roleId:row.role_id,role:roleRow.name as RoleName,
      status:row.status as ChurchMembershipStatus,joinedAt:row.joined_at,createdAt:row.created_at,updatedAt:row.updated_at,church,
    }];
  });
  const platformRoles=(platformRolesResult.data||[]).flatMap(row=>{
    const role=related(row.platform_roles);
    return role?[{userId:row.user_id,platformRoleId:row.platform_role_id,isActive:row.is_active,createdAt:row.created_at,updatedAt:row.updated_at,role:{id:role.id,code:role.code,name:role.name,createdAt:role.created_at}}]:[];
  });
  return{memberships,platformRoles};
}
