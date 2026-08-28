import type { ProjectGoalView } from "../types";

const peso=(value:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(value||0);
const dateLabel=(value:string|null)=>value?new Intl.DateTimeFormat("en-PH",{month:"short",day:"numeric",year:"numeric"}).format(new Date(`${value}T00:00:00`)):"Not set";

function ProjectGoal({goal}:{goal:ProjectGoalView}) {
  const progress=Math.min(100,Math.max(0,goal.progressPercentage));
  return <article className="goal-row"><div><span>Project Name</span><b>{goal.projectName}</b></div><div><span>Goal Amount</span><b>{peso(goal.goalAmount)}</b></div><div><span>Amount Raised</span><b>{peso(goal.amountRaised)}</b></div><div><span>Progress · {progress}%</span><b>Target Date · {dateLabel(goal.targetDate)}</b></div><i aria-label={`${goal.projectName} progress ${progress}%`}><em style={{width:`${progress}%`}}/></i></article>;
}

export function ProjectGoalsPanel({goals}:{goals:ProjectGoalView[]}) {
  return <section className="panel project-goals-panel"><div className="panel-head"><div><p className="eyebrow">Future-ready</p><h2>Project goals</h2></div><span className="period-button">{goals.length} configured</span></div>{goals.length?<div className="goal-list">{goals.map(goal=><ProjectGoal goal={goal} key={goal.projectId}/>)}</div>:<div className="project-goal-ready"><div className="empty-icon">◇</div><div><b>Goal reporting is ready</b><p>Project name, goal amount, amount raised, progress percentage, and target date will appear here when goal data is added.</p></div></div>}</section>;
}
