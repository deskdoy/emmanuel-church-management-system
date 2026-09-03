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



type Donation = {

  id: string;

  donation_date: string;

  donor_name: string;

  amount: number;

  payment_method: string;

};



type Option = {

  id: string;

  name: string;

};



type DonationsViewProps = {

  churchId: string;

  userId: string;

};




export function DonationsView({

  churchId,

  userId,

}: DonationsViewProps) {


  const [donations, setDonations] =
    useState<Donation[]>([]);


  const [members, setMembers] =
    useState<Option[]>([]);


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

          donationResult,

          memberResult,

          accountResult,

          categoryResult,

          projectResult,

          paymentResult,

        ] =
          await Promise.all([



            db
              .from("donations")
              .select(
                `
                id,
                donation_date,
                donor_name,
                amount,
                payment_method
                `
              )
              .eq(
                "church_id",
                churchId
              )
              .order(
                "donation_date",
                {
                  ascending:false,
                }
              ),



            db
              .from("members")
              .select(
                `
                id,
                first_name,
                last_name
                `
              )
              .eq(
                "church_id",
                churchId
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



        setDonations(
          donationResult.data || []
        );


        setMembers(
          (memberResult.data || []).map(
            member => ({
              id: member.id,
              name:
                `${member.first_name} ${member.last_name}`,
            })
          )
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






  async function saveDonation(
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



    const donorMemberId =
      String(
        form.get("donor_member_id") || ""
      );



    const {

      error,

    } =
      await db
        .from("donations")
        .insert({

          church_id:
            churchId,


          donation_date:
            form.get("donation_date"),


          donor_member_id:
            donorMemberId || null,


          donor_name:
            String(
              form.get("donor_name") || ""
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
            Donations
          </h2>


          <p className="section-copy">
            Record member and special donations.
          </p>


        </div>



        <button

          className="primary-button"

          onClick={() =>
            setShowForm(true)
          }

        >

          Add Donation

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

            onSubmit={saveDonation}

          >

            <div className="form-grid">


              <label>

                Donation Date

                <input

                  type="date"

                  name="donation_date"

                  required

                />

              </label>



              <label>

                Donor Member

                <select

                  name="donor_member_id"

                >

                  <option value="">
                    Walk-in / External Donor
                  </option>

                  {
                    members.map(
                      member => (

                        <option

                          key={member.id}

                          value={member.id}

                        >

                          {member.name}

                        </option>

                      )
                    )
                  }

                </select>

              </label>




              <label>

                Donor Name

                <input

                  name="donor_name"

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
                    : "Save Donation"
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
            label="Loading donations"
          />

        ) : donations.length === 0 ? (

          <EmptyState

            title="No donations yet"

            description="Record your first donation."

          />

        ) : (

          <div className="table-wrap responsive-table">

            <table>

              <thead>

                <tr>

                  <th>Date</th>

                  <th>Donor</th>

                  <th>Amount</th>

                  <th>Payment</th>

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
                          {donation.donation_date}
                        </td>

                        <td>
                          {donation.donor_name}
                        </td>

                        <td>
                          {donation.amount}
                        </td>

                        <td>
                          {donation.payment_method}
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