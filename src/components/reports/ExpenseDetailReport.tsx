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
  scope: string;
};



export function ExpenseDetailReport({
  data,
  scope,
}: Props) {


  const expenses =
    data.transactions.filter(
      transaction =>
        transaction.source === "expenses"
    );


  const total =
    expenses.reduce(
      (sum,item)=>
        sum + item.moneyOut,
      0
    );



  return (

    <article className="panel report-sheet leadership-report">


      <div className="report-brand">

        <div>

          <p className="eyebrow">
            Leadership report
          </p>

          <h3>
            Expense Detail Report
          </h3>

          <span>
            {scope}
          </span>

        </div>

      </div>





      <div className="report-asof-total">

        <span>
          Total Expenses
        </span>

        <strong>
          {peso(total)}
        </strong>

      </div>





      <table className="leadership-table">


        <thead>

          <tr>

            <th>
              Date
            </th>

            <th>
              Vendor
            </th>

            <th>
              Description
            </th>

            <th>
              Category
            </th>

            <th className="num">
              Amount
            </th>

            <th>
              Payment
            </th>

          </tr>

        </thead>



        <tbody>


        {
          expenses.map(
            expense => (

              <tr
                key={
                  expense.id
                }
              >

                <td>
                  {expense.date}
                </td>


                <td>
                  {expense.vendor || "-"}
                </td>


                <td>
                  {expense.description || "-"}
                </td>


                <td>
                  {expense.category}
                </td>


                <td className="num">

                  {peso(
                    expense.moneyOut
                  )}

                </td>


                <td>
                  {expense.paymentMethod || "-"}
                </td>


              </tr>

            )
          )
        }


        {
          !expenses.length && (

            <tr>

              <td
                colSpan={6}
                className="blank-row"
              >
                No expenses recorded.
              </td>

            </tr>

          )
        }


        </tbody>


      </table>




      <footer>
        Generated for {scope}
      </footer>


    </article>

  );

}