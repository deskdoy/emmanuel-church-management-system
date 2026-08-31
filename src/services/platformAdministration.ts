import { supabase } from "../lib/supabase";
import type { ChurchDraftInput, ChurchStatus, PlatformChurchSummary, PlatformOverview } from "../types";

const client=()=>{if(!supabase)throw new Error("Supabase is not configured.");return supabase;};
const relationName=(value:unknown)=>{const role=Array.isArray(value)?value[0]:value;return String((role as {name?:unknown}|null)?.name||"");};

export async function loadPlatformOverview():Promise<PlatformOverview>{
  const db=client();
  const [churchesResult,usersResult]=await Promise.all([
    db.from("churches").select("id,name,slug,address,logo_url,status,timezone,currency,created_at,updated_at,church_memberships(id,status,roles(name))").order("created_at"),
    db.from("users").select("id",{count:"exact",head:true}),
  ]);
  if(churchesResult.error)throw new Error(`Unable to load churches: ${churchesResult.error.message}`);
  if(usersResult.error)throw new Error(`Unable to load platform users: ${usersResult.error.message}`);
  const churches:PlatformChurchSummary[]=(churchesResult.data||[]).map(row=>{
    const memberships=row.church_memberships||[];
    return{id:row.id,name:row.name,slug:row.slug,address:row.address||"",logoUrl:row.logo_url,status:row.status as ChurchStatus,timezone:row.timezone,currency:row.currency,createdAt:row.created_at,updatedAt:row.updated_at,totalMemberships:memberships.length,activeMemberships:memberships.filter(item=>item.status==="active").length,activeAdmins:memberships.filter(item=>item.status==="active"&&relationName(item.roles)==="Admin").length};
  });
  return{churches,totalUsers:usersResult.count||0,totalMemberships:churches.reduce((sum,church)=>sum+church.totalMemberships,0)};
}

export async function createChurchDraft(input:ChurchDraftInput){
  const {data,error}=await client().rpc("create_platform_church_draft",{p_name:input.name,p_slug:input.slug,p_address:input.address,p_timezone:input.timezone,p_currency:input.currency});
  if(error){if(error.code==="23505")throw new Error("That church slug is already in use.");throw new Error(error.message);}
  return String(data);
}
