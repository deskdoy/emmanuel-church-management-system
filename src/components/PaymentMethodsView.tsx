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



type PaymentMethod = {

  id: string;

  name: string;

  is_active: boolean;

};



type PaymentMethodsViewProps = {

  churchId: string;

};



export function PaymentMethodsView({

  churchId,

}: PaymentMethodsViewProps) {


  const [methods, setMethods] =
    useState<PaymentMethod[]>([]);


  const [loading, setLoading] =
    useState(true);


  const [showForm, setShowForm] =
    useState(false);


  const [saving, setSaving] =
    useState(false);


  const [error, setError] =
    useState("");



  const loadMethods =
    useCallback(
      async () => {

        setLoading(true);
        setError("");


        const db = client();


        const {
          data,
          error,
        } =
          await db
            .from("payment_methods")
            .select(
              `
              id,
              name,
              is_active
              `
            )
            .eq(
              "church_id",
              churchId
            )
            .order(
              "name"
            );



        if (error) {

          setError(
            error.message
          );

          setLoading(false);

          return;

        }



        setMethods(
          data || []
        );


        setLoading(false);

      },
      [
        churchId,
      ]
    );




  useEffect(() => {

    void loadMethods();

  }, [
    loadMethods,
  ]);





  async function saveMethod(
    event: FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();


    setSaving(true);
    setError("");



    const form =
      new FormData(
        event.currentTarget
      );


    const name =
      String(
        form.get("name") || ""
      );



    const db = client();


    const {
      error,
    } =
      await db
        .from("payment_methods")
        .insert({

          church_id:
            churchId,

          name,

          is_active:
            true,

        });



    if (error) {

      setError(
        error.message
      );

      setSaving(false);

      return;

    }



    setShowForm(false);

    await loadMethods();

    setSaving(false);

  }






  return (

    <section className="panel table-panel">


      <div className="panel-head">


        <div>

          <p className="eyebrow">
            Financial Setup
          </p>


          <h2>
            Payment Methods
          </h2>


          <p className="section-copy">
            Manage accepted payment methods for your church.
          </p>


        </div>



        <button

          className="primary-button"

          onClick={() =>
            setShowForm(true)
          }

        >

          Add Payment Method

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

            onSubmit={
              saveMethod
            }

          >

            <div className="form-grid">


              <label className="full">

                Payment Method Name

                <input

                  name="name"

                  placeholder="Example: PayPal"

                  required

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
                    : "Save Payment Method"
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
            label="Loading payment methods"
          />

        ) : methods.length === 0 ? (

          <EmptyState

            title="No payment methods"

            description="Add your first payment method."

          />

        ) : (


          <div className="table-wrap responsive-table">


            <table>


              <thead>

                <tr>

                  <th>
                    Payment Method
                  </th>

                  <th>
                    Status
                  </th>

                </tr>

              </thead>


              <tbody>


              {
                methods.map(
                  method => (

                    <tr
                      key={
                        method.id
                      }
                    >

                      <td>

                        {
                          method.name
                        }

                      </td>


                      <td>

                        {
                          method.is_active
                            ? "Active"
                            : "Inactive"
                        }

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