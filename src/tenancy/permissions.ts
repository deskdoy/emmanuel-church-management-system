import type { RoleName } from "../types";

export const financeWriterRoles:RoleName[]=["Admin","Treasurer","Encoder"];
export const accountManagerRoles:RoleName[]=["Admin","Treasurer"];
export const projectManagerRoles:RoleName[]=["Admin","Pastor","Secretary"];

export const hasChurchRole=(role:RoleName|null|undefined,allowed:readonly RoleName[])=>!!role&&allowed.includes(role);
