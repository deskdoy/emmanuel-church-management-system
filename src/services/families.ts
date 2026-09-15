import { supabase } from "../lib/supabase";

export interface Family {
  id: string;
  churchId: string;
  name: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyInput {
  name: string;
  notes?: string;
}

export interface FamilyMember {
  id: string;
  churchId: string;
  familyId: string | null;
  memberNumber: string | null;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  birthDate: string | null;
  baptismDate: string | null;
  joinedAt: string;
  phone: string;
  email: string | null;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  membershipStatus: string;
  ministry: string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FamilyRow {
  id: string;
  church_id: string;
  name: string;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface FamilyMemberRow {
  id: string;
  church_id: string;
  family_id: string | null;
  member_number: string | null;
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: string;
  birth_date: string | null;
  baptism_date: string | null;
  joined_at: string;
  phone: string;
  email: string | null;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  membership_status: string;
  ministry: string;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const familyColumns = "id,church_id,name,notes,created_by,created_at,updated_at";
const memberColumns = "id,church_id,family_id,member_number,first_name,middle_name,last_name,gender,birth_date,baptism_date,joined_at,phone,email,address,emergency_contact_name,emergency_contact_phone,membership_status,ministry,notes,created_by,created_at,updated_at";

const requireId = (value: string, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
};

const client = (churchId: string) => {
  requireId(churchId, "Church workspace");
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

const familyValues = (family: FamilyInput) => {
  requireId(family.name, "Family name");
  // General edits cannot change church ownership or creation metadata.
  return { name: family.name.trim(), notes: family.notes?.trim() || "" };
};

const mapFamily = (row: FamilyRow): Family => ({
  id: row.id, churchId: row.church_id, name: row.name, notes: row.notes,
  createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
});

const mapFamilyMember = (row: FamilyMemberRow): FamilyMember => ({
  id: row.id, churchId: row.church_id, familyId: row.family_id,
  memberNumber: row.member_number, firstName: row.first_name,
  middleName: row.middle_name, lastName: row.last_name, gender: row.gender,
  birthDate: row.birth_date, baptismDate: row.baptism_date, joinedAt: row.joined_at,
  phone: row.phone, email: row.email, address: row.address,
  emergencyContactName: row.emergency_contact_name, emergencyContactPhone: row.emergency_contact_phone,
  membershipStatus: row.membership_status, ministry: row.ministry, notes: row.notes,
  createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
});

export async function loadFamilies(churchId: string): Promise<Family[]> {
  const { data, error } = await client(churchId).from("families")
    .select(familyColumns).eq("church_id", churchId)
    .order("name").order("id");
  if (error) throw new Error(`Unable to load families: ${error.message}`);
  return (data || []).map(mapFamily);
}

export async function createFamily(churchId: string, family: FamilyInput): Promise<Family> {
  const db = client(churchId);
  const values = familyValues(family);
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw new Error(authError?.message || "Your session has expired.");
  const { data, error } = await db.from("families")
    .insert({ ...values, church_id: churchId, created_by: auth.user.id })
    .select(familyColumns).single();
  if (error) throw new Error(`Unable to create family: ${error.message}`);
  return mapFamily(data);
}

export async function updateFamily(churchId: string, familyId: string, family: FamilyInput): Promise<Family> {
  const db = client(churchId);
  requireId(familyId, "Family");
  const { data, error } = await db.from("families").update(familyValues(family))
    .eq("church_id", churchId).eq("id", familyId)
    .select(familyColumns).single();
  if (error) throw new Error(`Unable to update family: ${error.message}`);
  return mapFamily(data);
}

export async function deleteFamily(churchId: string, familyId: string): Promise<void> {
  const db = client(churchId);
  requireId(familyId, "Family");
  // The restrictive FK requires callers to explicitly unlink members first.
  const { error } = await db.from("families").delete()
    .eq("church_id", churchId).eq("id", familyId)
    .select("id").single();
  if (error) throw new Error(`Unable to delete family: ${error.message}`);
}

export async function loadFamilyMembers(churchId: string, familyId: string): Promise<FamilyMember[]> {
  const db = client(churchId);
  requireId(familyId, "Family");
  const { data, error } = await db.from("members").select(memberColumns)
    .eq("church_id", churchId).eq("family_id", familyId)
    .order("last_name").order("first_name").order("id");
  if (error) throw new Error(`Unable to load family members: ${error.message}`);
  return (data || []).map(mapFamilyMember);
}

export async function assignMemberFamily(
  churchId: string,
  memberId: string,
  familyId: string | null,
): Promise<FamilyMember> {
  const db = client(churchId);
  requireId(memberId, "Member");
  if (familyId !== null) {
    requireId(familyId, "Family");
    const { error } = await db.from("families").select("id")
      .eq("church_id", churchId).eq("id", familyId).single();
    if (error) throw new Error(`Unable to find family in this church: ${error.message}`);
  }
  // NULL explicitly unlinks. RLS controls member writes; the composite FK
  // enforces same-church family ownership even if the family changes meanwhile.
  const { data, error } = await db.from("members").update({ family_id: familyId })
    .eq("church_id", churchId).eq("id", memberId)
    .select(memberColumns).single();
  if (error) throw new Error(`Unable to assign member family: ${error.message}`);
  return mapFamilyMember(data);
}
