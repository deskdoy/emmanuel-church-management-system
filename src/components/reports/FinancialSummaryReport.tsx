import { buildCashFlowStatement, buildAccountSummaries } from "../../reporting/calculations";
import type { CashFlowData } from "../../types";

const peso = (value:number) =>
  new Intl.NumberFormat(
    "en-PH",
    {
      style:"currency",
      currency:"PHP"
    }
  ).format(value || 0);



type Props = {
  data: CashFlowData;
};



export function FinancialSummaryReport({
  data,
}: Props) {


  const today =
    new Date();


  const month =
    `${today.getFullYear()}-${String(
      today.getMonth()+1
    ).padStart(2,"0")}`;


  const statement =
    buildCashFlowStatement(
      data,
      {
        start:`${month}-01`,
        end:today.toISOString().slice(0,10),
      }
    );



  const accounts =
    buildAccountSummaries(
      data
    );



  const recent =
    [...data.transactions]
      .sort(
        (a,b)=>
          b.createdAt.localeCompare(
            a.createdAt
          )
      )
      .slice(
        0,
        8
      );



  return (

    <section className="panel table-panel">


      <div className="panel-head">

        <div>

          <p className="eyebrow">
            Executive Summary
          </p>

          <h2>
            Financial Summary
          </h2>

          <p className="section-copy">
            Complete overview of church financial activity.
          </p>

        </div>

      </div>




      <section className="leadership-metrics">


        <article className="metric-card">

          <div className="metric-label">
            Total Income
          </div>

          <strong className="income-text">
            {peso(statement.moneyIn.total)}
          </strong>

        </article>



        <article className="metric-card">

          <div className="metric-label">
            Total Expenses
          </div>

          <strong>
            {peso(statement.moneyOut.total)}
          </strong>

        </article>




        <article className="metric-card featured">

          <div className="metric-label">
            Net Available Funds
          </div>

          <strong>
            {peso(
              statement.endingBalance
            )}
          </strong>

        </article>



      </section>





      <div className="dashboard-reporting-grid">


        <section className="panel">


          <div className="panel-head">

            <h2>
              Income Breakdown
            </h2>

          </div>


          <p>
            Offerings:
            <b>
              {" "}
              {peso(
                statement.moneyIn.offerings
              )}
            </b>
          </p>


          <p>
            Donations:
            <b>
              {" "}
              {peso(
                statement.moneyIn.donations
              )}
            </b>
          </p>


          <p>
            Other Income:
            <b>
              {" "}
              {peso(
                statement.moneyIn.otherIncome
              )}
            </b>
          </p>


        </section>





        <section className="panel">


          <div className="panel-head">

            <h2>
              Expense Breakdown
            </h2>

          </div>


          <p>
            Expenses:
            <b>
              {" "}
              {peso(
                statement.moneyOut.expenses
              )}
            </b>
          </p>


          <p>
            Other Expenses:
            <b>
              {" "}
              {peso(
                statement.moneyOut.otherExpenses
              )}
            </b>
          </p>


        </section>



      </div>





      <section className="panel">


        <div className="panel-head">

          <h2>
            Account Balances
          </h2>

        </div>



        <table className="leadership-table">


          <thead>

            <tr>

              <th>
                Account
              </th>

              <th>
                Balance
              </th>

            </tr>

          </thead>


          <tbody>


          {
            accounts.map(
              account => (

                <tr
                  key={
                    account.id
                  }
                >

                  <td>
                    {account.name}
                  </td>


                  <td>
                    {peso(
                      account.currentBalance
                    )}
                  </td>

                </tr>

              )
            )
          }


          </tbody>


        </table>


      </section>





      <section className="panel">


        <div className="panel-head">

          <h2>
            Recent Transactions
          </h2>

        </div>



        <table className="leadership-table">


          <thead>

            <tr>

              <th>
                Date
              </th>

              <th>
                Type
              </th>

              <th>
                Category
              </th>

              <th>
                Amount
              </th>


            </tr>

          </thead>



          <tbody>


          {
            recent.map(
              transaction => (

                <tr
                  key={
                    transaction.id
                  }
                >

                  <td>
                    {transaction.date}
                  </td>


                  <td>
                    {transaction.type}
                  </td>


                  <td>
                    {transaction.category}
                  </td>


                  <td>
                    {peso(
                      transaction.moneyIn ||
                      transaction.moneyOut
                    )}
                  </td>


                </tr>

              )
            )
          }


          </tbody>


        </table>


      </section>


    </section>

  );

}