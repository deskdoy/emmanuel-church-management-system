import { FormEvent, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useActiveChurch } from "../../tenancy/ActiveChurchContext";
import { createDefaultFinancialSetup } from "../../services/setup";
import { TeamSetupStep } from "./TeamSetupStep";
import { SetupComplete } from "./SetupComplete";


export function ChurchSetupWizard() {

  const { activeChurch } = useActiveChurch();

  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");


  if (!activeChurch) {
    return null;
  }



  async function saveProfile(
    event: FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();

    setSaving(true);
    setError("");
    setMessage("");


    const form =
      new FormData(event.currentTarget);


    const name =
      String(form.get("name") || "");

    const address =
      String(form.get("address") || "");

    const timezone =
      String(form.get("timezone") || "");

    const currency =
      String(form.get("currency") || "");



    const { error: churchError } =
      await supabase
        .from("churches")
        .update({
          name,
          address,
          timezone,
          currency,
        })
        .eq(
          "id",
          activeChurch.id
        );


    if (churchError) {

      setError(
        churchError.message
      );

      setSaving(false);

      return;
    }



    const { error: progressError } =
      await supabase
        .from("church_setup_progress")
        .update({
          profile_completed: true,
        })
        .eq(
          "church_id",
          activeChurch.id
        );


    if (progressError) {

      setError(
        progressError.message
      );

      setSaving(false);

      return;
    }



    setMessage(
      "Church profile saved."
    );


    setStep(2);


    setSaving(false);

  }





  async function createFinancialSetup() {

    setSaving(true);
    setError("");
    setMessage("");


    try {

      await createDefaultFinancialSetup(
        activeChurch.id
      );


      setMessage(
  "Financial setup completed."
);

setStep(3);


    } catch (error) {


      setError(
        error instanceof Error
          ? error.message
          : "Unable to create financial setup."
      );


    } finally {

      setSaving(false);

    }

  }





  return (

    <main className="setup-page">

      <section className="setup-card">


        <p className="eyebrow">
          Church Setup · Step {step}
        </p>



        <h1>

{
  step === 1
    ? "Complete your church profile"
    : step === 2
      ? "Set up your financial workspace"
      : step === 3
        ? "Build your church team"
        : "Setup Complete"
}

</h1>



        <p className="login-copy">

          {
  step === 1
    ? "Tell us about your church before setting up the rest of your workspace."
    : step === 2
      ? "Create your starting accounts and categories to begin managing church finances."
      : step === 3
        ? "Invite your team members who will help manage your church workspace."
        : "Your church workspace is ready."
}

        </p>




        {error && (

          <div className="form-error">
            {error}
          </div>

        )}



        {message && (

          <div className="form-success">
            {message}
          </div>

        )}






        {step === 1 && (

          <form
            className="record-form"
            onSubmit={saveProfile}
          >


            <div className="form-grid">


              <label className="full">

                Church Name

                <input
                  name="name"
                  defaultValue={
                    activeChurch.name
                  }
                  required
                />

              </label>



              <label className="full">

                Address

                <input
                  name="address"
                  defaultValue={
                    activeChurch.address
                  }
                  required
                />

              </label>



              <label>

                Timezone

                <input
                  name="timezone"
                  defaultValue={
                    activeChurch.timezone
                  }
                  required
                />

              </label>



              <label>

                Currency

                <input
                  name="currency"
                  defaultValue={
                    activeChurch.currency
                  }
                  required
                />

              </label>


            </div>



            <button
              className="primary-button form-submit"
              disabled={saving}
            >

              {
                saving
                  ? "Saving..."
                  : "Save and Continue"
              }

            </button>


          </form>

        )}







        {step === 2 && (

          <section className="record-form">


            <p>
              We will create your starting financial workspace.
            </p>



            <ul>

              <li>
                Cash Account
              </li>

              <li>
                Bank Account
              </li>

              <li>
                Income Categories
              </li>

              <li>
                Expense Categories
              </li>

            </ul>




            <button
              className="primary-button form-submit"
              onClick={
                createFinancialSetup
              }
              disabled={saving}
            >

              {
                saving
                  ? "Creating..."
                  : "Create Financial Setup"
              }

            </button>


          </section>

        )}

        {step === 3 && (

  <TeamSetupStep

    onComplete={() => {
      setStep(4);
    }}

  />

)}

{step === 4 && (

  <SetupComplete

    onContinue={() => {
      window.location.reload();
    }}

  />

)}



      </section>


    </main>

  );

}