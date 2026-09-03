import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

import { supabase } from "../lib/supabase";
import { EmptyState } from "./ui/EmptyState";
import { LoadingSkeleton } from "./ui/LoadingSkeleton";


const client = () => {

  if (!supabase) {
    throw new Error(
      "Supabase is not configured."
    );
  }

  return supabase;

};



type Offering = {

  id: string;

  offering_date: string;

  service_name: string;

  amount: number;

  payment_method: string;

};



type Option = {

  id: string;

  name: string;

};



type OfferingsViewProps = {

  churchId: string;

  userId: string;

};



export function OfferingsView({

  churchId,

  userId,

}: OfferingsViewProps) {


  const [offerings, setOfferings] =
    useState<Offering[]>([]);


  const [accounts, setAccounts] =
    useState<Option[]>([]);


  const [categories, setCategories] =
    useState<Option[]>([]);


  const [paymentMethods, setPaymentMethods] =
    useState<Option[]>([]);



  const [loading, setLoading] =
    useState(true);


  const [showForm, setShowForm] =
    useState(false);


  const [saving, setSaving] =
    useState(false);


  const [error, setError] =
    useState("");





  const loadData =
    useCallback(
      async () => {

        setLoading(true);

        setError("");


        const db = client();



        const [
          offeringResult,
          accountResult,
          categoryResult,
          paymentResult,
        ] =
          await Promise.all([


            db
              .from("offerings")
              .select(
                `
                id,
                offering_date,
                service_name,
                amount,
                payment_method
                `
              )
              .eq(
                "church_id",
                churchId
              )
              .order(
                "offering_date",
                {
                  ascending: false,
                }
              ),



            db
              .from("accounts")
              .select(
                "id,name"
              )
              .eq(
                "church_id",
                churchId
              )
              .eq(
                "is_active",
                true
              ),



            db
              .from("categories")
              .select(
                "id,name"
              )
              .eq(
                "church_id",
                churchId
              )
              .eq(
                "transaction_type",
                "Income"
              )
              .eq(
                "is_active",
                true
              ),



            db
              .from("payment_methods")
              .select(
                "id,name"
              )
              .eq(
                "church_id",
                churchId
              )
              .eq(
                "is_active",
                true
              ),

          ]);



        if (offeringResult.error) {

          setError(
            offeringResult.error.message
          );

        }


        setOfferings(
          offeringResult.data || []
        );


        setAccounts(
          accountResult.data || []
        );


        setCategories(
          categoryResult.data || []
        );


        setPaymentMethods(
          paymentResult.data || []
        );


        setLoading(false);


      },
      [
        churchId,
      ]
    );




  useEffect(() => {

    void loadData();

  }, [
    loadData,
  ]);






  async function saveOffering(
    event: FormEvent<HTMLFormElement>
  ) {


    event.preventDefault();


    setSaving(true);

    setError("");



    const form =
      new FormData(
        event.currentTarget
      );



    const db = client();



    const {
      error,
    } =
      await db
        .from("offerings")
        .insert({

          church_id:
            churchId,

          offering_date:
            form.get("offering_date"),

          service_name:
            form.get("service_name"),

          description:
            form.get("description"),

          amount:
            Number(
              form.get("amount")
            ),

          account_id:
            form.get("account_id"),

          category_id:
            form.get("category_id"),

          payment_method:
            form.get("payment_method"),

          reference:
  String(
    form.get("reference") || ""
  ),

          notes:
            form.get("notes"),

          recorded_by:
            userId,

        });



    if (error) {

      setError(
        error.message
      );

      setSaving(false);

      return;

    }



    setShowForm(false);

    await loadData();

    setSaving(false);


  }






  return (

    <section className="panel table-panel">


      <div className="panel-head">

        <div>

          <p className="eyebrow">
            Church Finance
          </p>

          <h2>
            Offerings
          </h2>

          <p className="section-copy">
            Record worship offerings and collections.
          </p>

        </div>


        <button

          className="primary-button"

          onClick={() =>
            setShowForm(true)
          }

        >
          Add Offering
        </button>


      </div>





      {
        error && (

          <div className="error-banner">
            {error}
          </div>

        )
      }






      {
        showForm && (

          <form

            className="record-form"

            onSubmit={saveOffering}

          >

            <div className="form-grid">


              <label>

                Offering Date

                <input

                  type="date"

                  name="offering_date"

                  required

                />

              </label>



              <label>

                Service Name

                <input

                  name="service_name"

                  placeholder="Sunday Worship"

                  required

                />

              </label>



              <label>

                Amount

                <input

                  type="number"

                  name="amount"

                  required

                />

              </label>



              <label>

                Account

                <select

                  name="account_id"

                  required

                >

                  {
                    accounts.map(
                      item => (

                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.name}
                        </option>

                      )
                    )
                  }

                </select>

              </label>




              <label>

                Category

                <select

                  name="category_id"

                  required

                >

                  {
                    categories.map(
                      item => (

                        <option
                          key={item.id}
                          value={item.id}
                        >
                          {item.name}
                        </option>

                      )
                    )
                  }

                </select>

              </label>




              <label>

                Payment Method

                <select

                  name="payment_method"

                  required

                >

                  {
                    paymentMethods.map(
                      item => (

                        <option
                          key={item.id}
                          value={item.name}
                        >
                          {item.name}
                        </option>

                      )
                    )
                  }

                </select>

              </label>




              <label className="full">

                Description

                <input

                  name="description"

                />

              </label>



              <label className="full">

  Reference

  <input

    name="reference"

    placeholder="Optional reference number"

  />

</label>




              <label className="full">

                Notes

                <textarea

                  name="notes"

                  rows={3}

                />

              </label>


            </div>



            <div className="row-actions">


              <button

                type="button"

                className="outline-button"

                onClick={() =>
                  setShowForm(false)
                }

                disabled={saving}

              >

                Cancel

              </button>



              <button

                className="primary-button"

                disabled={saving}

              >

                {
                  saving
                    ? "Saving..."
                    : "Save Offering"
                }

              </button>


            </div>


          </form>

        )
      }






      {
        loading ? (

          <LoadingSkeleton
            rows={5}
            label="Loading offerings"
          />

        ) : offerings.length === 0 ? (

          <EmptyState

            title="No offerings yet"

            description="Record your first church offering."

          />

        ) : (

          <div className="table-wrap responsive-table">

            <table>

              <thead>

                <tr>

                  <th>
                    Date
                  </th>

                  <th>
                    Service
                  </th>

                  <th>
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
                    item => (

                      <tr
                        key={item.id}
                      >

                        <td>
                          {item.offering_date}
                        </td>

                        <td>
                          {item.service_name}
                        </td>

                        <td>
                          {item.amount}
                        </td>

                        <td>
                          {item.payment_method}
                        </td>


                      </tr>

                    )
                  )
                }

              </tbody>


            </table>

          </div>

        )
      }



    </section>

  );

}