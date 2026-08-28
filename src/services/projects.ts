import { supabase } from "../lib/supabase";
import type { Project, ProjectInput } from "../types";

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

const numeric = (value:unknown) => Number(value) || 0;

export async function loadProjects():Promise<Project[]> {
  const { data, error } = await client().from("projects")
    .select("id,name,description,budget,start_date,end_date,status,created_at")
    .order("created_at", { ascending:false });
  if (error) throw new Error(`Unable to load projects: ${error.message}`);
  return (data || []).map(row => ({
    id:row.id,
    name:row.name,
    description:row.description,
    budget:numeric(row.budget),
    startDate:row.start_date,
    endDate:row.end_date,
    status:row.status,
    createdAt:row.created_at,
    // This isolated view model can be populated when dedicated fundraising fields are added later.
    funding:{goalAmount:null,currentAmountRaised:null,progressPercentage:null,targetDate:null},
  }));
}

const values = (project:ProjectInput) => ({
  name:project.name.trim(),
  description:project.description.trim(),
  budget:project.budget,
  start_date:project.startDate || null,
  end_date:project.endDate || null,
  status:project.status,
});

export async function saveProject(project:ProjectInput) {
  if (!project.name.trim()) throw new Error("Project name is required.");
  if (!Number.isFinite(project.budget) || project.budget < 0) throw new Error("Enter a valid project budget.");
  if (project.startDate && project.endDate && project.endDate < project.startDate) throw new Error("Target date must be on or after the start date.");
  const db=client();
  if (project.id) {
    const { error } = await db.from("projects").update(values(project)).eq("id",project.id).select("id").single();
    if (error) throw new Error(error.message);
    return;
  }
  const { data:userData,error:userError }=await db.auth.getUser();
  if(userError||!userData.user)throw new Error(userError?.message||"Your session has expired.");
  const { error } = await db.from("projects").insert({...values(project),created_by:userData.user.id}).select("id").single();
  if (error) throw new Error(error.message);
}
