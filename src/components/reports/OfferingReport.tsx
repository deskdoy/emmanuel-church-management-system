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



export function OfferingReport({
  data,
  scope,
}: Props) {


  const offerings =
    data.transactions.filter(
      transaction =>
        transaction.source === "offerings"
    );


  const total =
    offerings.reduce(
      (sum,item)=>
        sum + item.moneyIn,
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
            Offering Report
          </h3>

          <span>
            {scope}
          </span>

        </div>

      </div>





      <div className="report-asof-total">

        <span>
          Total Offerings
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
          offerings.map(
            offering => (

              <tr
                key={offering.id}
              >

                <td>
                  {offering.date}
                </td>


                <td>
                  {offering.description || "-"}
                </td>


                <td>
                  {offering.category}
                </td>


                <td className="num">

                  {peso(
                    offering.moneyIn
                  )}

                </td>


                <td>
                  {offering.paymentMethod || "-"}
                </td>


              </tr>

            )
          )
        }


        {
          !offerings.length && (

            <tr>

              <td
                colSpan={5}
                className="blank-row"
              >
                No offerings recorded.
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