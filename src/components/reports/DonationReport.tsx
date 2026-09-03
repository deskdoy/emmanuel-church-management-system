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



export function DonationReport({
  data,
  scope,
}: Props) {


  const donations =
    data.transactions.filter(
      transaction =>
        transaction.source === "donations"
    );


  const total =
    donations.reduce(
      (sum,item) =>
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
            Donation Report
          </h3>

          <span>
            {scope}
          </span>

        </div>

      </div>





      <div className="report-asof-total">

        <span>
          Total Donations
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
              Donor
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
          donations.map(
            donation => (

              <tr
                key={
                  donation.id
                }
              >

                <td>
                  {donation.date}
                </td>


                <td>
                  {donation.description || "-"}
                </td>


                <td>
                  {donation.category}
                </td>


                <td>
                  {donation.category}
                </td>


                <td className="num">

                  {peso(
                    donation.moneyIn
                  )}

                </td>


                <td>
                  {donation.paymentMethod || "-"}
                </td>


              </tr>

            )
          )
        }


        {
          !donations.length && (

            <tr>

              <td
                colSpan={6}
                className="blank-row"
              >
                No donations recorded.
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