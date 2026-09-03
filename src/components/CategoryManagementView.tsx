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



type Category = {

  id: string;

  name: string;

  transaction_type: string;

  category_group: string;

  is_active: boolean;

};



type CategoryManagementViewProps = {

  churchId: string;

};



const categoryTypes = [

  "Income",

  "Expense",

];




export function CategoryManagementView({

  churchId,

}: CategoryManagementViewProps) {


  const [categories, setCategories] =
    useState<Category[]>([]);


  const [loading, setLoading] =
    useState(true);


  const [showForm, setShowForm] =
    useState(false);


  const [saving, setSaving] =
    useState(false);


  const [error, setError] =
    useState("");



  const loadCategories =
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
            .from("categories")
            .select(
              `
              id,
              name,
              transaction_type,
              category_group,
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


        setCategories(
          data || []
        );


        setLoading(false);


      },
      [
        churchId,
      ]
    );




  useEffect(() => {

    void loadCategories();

  }, [
    loadCategories,
  ]);





  async function saveCategory(
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


    const transactionType =
      String(
        form.get("transaction_type")
      );



    const db = client();


    const {
      error,
    } =
      await db
        .from("categories")
        .insert({

          church_id:
            churchId,

          name,

          transaction_type:
            transactionType,

          category_group:
            transactionType,

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

    await loadCategories();

    setSaving(false);

  }





  const income =
    categories.filter(
      item =>
        item.transaction_type === "Income"
    );


  const expenses =
    categories.filter(
      item =>
        item.transaction_type === "Expense"
    );





  return (

    <section className="panel table-panel">


      <div className="panel-head">

        <div>

          <p className="eyebrow">
            Financial Setup
          </p>


          <h2>
            Categories
          </h2>


          <p className="section-copy">
            Manage income and expense categories.
          </p>


        </div>



        <button

          className="primary-button"

          onClick={() =>
            setShowForm(true)
          }

        >

          Add Category

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
              saveCategory
            }

          >

            <div className="form-grid">


              <label className="full">

                Category Name

                <input

                  name="name"

                  required

                />

              </label>



              <label>

                Type

                <select

                  name="transaction_type"

                  defaultValue="Income"

                >

                  {
                    categoryTypes.map(
                      type => (

                        <option
                          key={type}
                          value={type}
                        >
                          {type}
                        </option>

                      )
                    )
                  }

                </select>

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
                    : "Save Category"
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
            label="Loading categories"
          />

        ) : (


          <div className="category-columns">


            <section className="panel">


              <h3>
                Income Categories
              </h3>


              {
                income.length ? (

                  <ul>

                    {
                      income.map(
                        item => (

                          <li
                            key={item.id}
                          >
                            {item.name}
                          </li>

                        )
                      )
                    }

                  </ul>

                ) : (

                  <EmptyState

                    compact

                    title="No income categories"

                    description="Add your first income category."

                  />

                )

              }


            </section>





            <section className="panel">


              <h3>
                Expense Categories
              </h3>


              {
                expenses.length ? (

                  <ul>

                    {
                      expenses.map(
                        item => (

                          <li
                            key={item.id}
                          >
                            {item.name}
                          </li>

                        )
                      )
                    }

                  </ul>

                ) : (

                  <EmptyState

                    compact

                    title="No expense categories"

                    description="Add your first expense category."

                  />

                )

              }


            </section>



          </div>

        )

      }


    </section>

  );

}