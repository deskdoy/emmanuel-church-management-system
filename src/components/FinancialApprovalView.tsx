import { useEffect, useState } from "react";
import {
  approveExpense,
  loadPendingExpenses,
  rejectExpense,
  type PendingExpense
} from "../services/financialApproval";


const peso = (value:number) =>
  new Intl.NumberFormat(
    "en-PH",
    {
      style:"currency",
      currency:"PHP"
    }
  ).format(value);



export function FinancialApprovalView({
  churchId,
  userId
}:{
  churchId:string;
  userId:string;
}) {


  const [
    expenses,
    setExpenses
  ] = useState<PendingExpense[]>([]);


  const [
    loading,
    setLoading
  ] = useState(true);


  const [
    error,
    setError
  ] = useState("");



  const load = async()=>{

    try{

      setLoading(true);

      setExpenses(
        await loadPendingExpenses(
          churchId
        )
      );

    }
    catch(error){

      setError(
        error instanceof Error
          ? error.message
          : "Unable to load approvals."
      );

    }
    finally{

      setLoading(false);

    }

  };



  useEffect(()=>{

    void load();

  },[churchId]);





  const approve = async(
    expenseId:string
  )=>{

    await approveExpense(
      churchId,
      expenseId,
      userId
    );

    await load();

  };





  const reject = async(
    expenseId:string
  )=>{

    const reason =
      window.prompt(
        "Reason for rejection?"
      );


    if(!reason)return;


    await rejectExpense(
      churchId,
      expenseId,
      userId,
      reason
    );


    await load();

  };





  if(loading){

    return (
      <section className="panel">
        Loading approvals...
      </section>
    );

  }



  return (

    <section className="panel">

      <div className="panel-head">

        <div>

          <p className="eyebrow">
            Financial Governance
          </p>

          <h2>
            Pending Expense Approvals
          </h2>

        </div>

      </div>


      {error &&
        <div className="error-banner">
          {error}
        </div>
      }



      {!expenses.length &&

        <p>
          No pending expenses.
        </p>

      }



      {expenses.map(expense=>(

        <article
          key={expense.id}
          className="approval-card"
        >

          <h3>
            {expense.vendor}
          </h3>


          <p>
            {expense.description}
          </p>


          <strong>
            {peso(expense.amount)}
          </strong>


          <small>
            Status: {expense.approvalStatus}
          </small>



          <div>

            <button
              className="primary-button"
              onClick={()=>
                void approve(expense.id)
              }
            >
              Approve
            </button>


            <button
              className="outline-button"
              onClick={()=>
                void reject(expense.id)
              }
            >
              Reject
            </button>

          </div>


        </article>

      ))}


    </section>

  );

}