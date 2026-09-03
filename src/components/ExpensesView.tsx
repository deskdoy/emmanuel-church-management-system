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



type Expense = {

  id: string;

  expense_date: string;

  vendor: string;

  description: string;

  amount: number;

  payment_method: string;

};



type Option = {

  id: string;

  name: string;

};



type ExpensesViewProps = {

  churchId: string;

  userId: string;

};





export function ExpensesView({

  churchId,

  userId,

}: ExpensesViewProps) {


  const [expenses, setExpenses] =
    useState<Expense[]>([]);


  const [accounts, setAccounts] =
    useState<Option[]>([]);


  const [categories, setCategories] =
    useState<Option[]>([]);


  const [projects, setProjects] =
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
          expenseResult,
          accountResult,
          categoryResult,
          projectResult,
          paymentResult,

        ] =
          await Promise.all([


            db
              .from("expenses")
              .select(
                `
                id,
                expense_date,
                vendor,
                description,
                amount,
                payment_method
                `
              )
              .eq(
                "church_id",
                churchId
              )
              .order(
                "expense_date",
                {
                  ascending:false,
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
                "Expense"
              )
              .eq(
                "is_active",
                true
              ),



            db
              .from("projects")
              .select(
                "id,name"
              )
              .eq(
                "church_id",
                churchId
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



        setExpenses(
          expenseResult.data || []
        );


        setAccounts(
          accountResult.data || []
        );


        setCategories(
          categoryResult.data || []
        );


        setProjects(
          projectResult.data || []
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






  async function saveExpense(
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
        .from("expenses")
        .insert({

          church_id:
            churchId,


          expense_date:
            form.get("expense_date"),


          vendor:
            String(
              form.get("vendor") || ""
            ),


          description:
            String(
              form.get("description") || ""
            ),


          amount:
            Number(
              form.get("amount")
            ),


          account_id:
            form.get("account_id"),


          category_id:
            form.get("category_id"),


          project_id:
            form.get("project_id") || null,


          payment_method:
            form.get("payment_method"),


          reference:
            String(
              form.get("reference") || ""
            ),


          notes:
            String(
              form.get("notes") || ""
            ),


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
            Expenses
          </h2>


          <p className="section-copy">
            Record church expenses and payments.
          </p>


        </div>



        <button

          className="primary-button"

          onClick={() =>
            setShowForm(true)
          }

        >

          Add Expense

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

            onSubmit={saveExpense}

          >


            <div className="form-grid">


              <label>

                Expense Date

                <input

                  type="date"

                  name="expense_date"

                  required

                />

              </label>



              <label>

                Vendor

                <input

                  name="vendor"

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

                Project

                <select

                  name="project_id"

                >

                  <option value="">
                    No project
                  </option>


                  {
                    projects.map(
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
                    : "Save Expense"
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
            label="Loading expenses"
          />

        ) : expenses.length === 0 ? (

          <EmptyState

            title="No expenses yet"

            description="Record your first church expense."

          />

        ) : (

          <div className="table-wrap responsive-table">

            <table>

              <thead>

                <tr>

                  <th>Date</th>

                  <th>Vendor</th>

                  <th>Amount</th>

                  <th>Payment</th>

                </tr>

              </thead>


              <tbody>

                {
                  expenses.map(
                    expense => (

                      <tr
                        key={expense.id}
                      >

                        <td>
                          {expense.expense_date}
                        </td>

                        <td>
                          {expense.vendor}
                        </td>

                        <td>
                          {expense.amount}
                        </td>

                        <td>
                          {expense.payment_method}
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