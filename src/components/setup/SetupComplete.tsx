type SetupCompleteProps = {
  onContinue: () => void;
};


export function SetupComplete({
  onContinue,
}: SetupCompleteProps) {

  return (

    <main className="setup-page">

      <section className="setup-card">


        <p className="eyebrow">
          Church Setup Complete
        </p>



        <h1>
          Your workspace is ready 🎉
        </h1>



        <p className="login-copy">

          Congratulations! Your Faithful Steward
          church workspace has been successfully
          prepared.

        </p>




        <div className="setup-checklist">


          <div className="setup-check-item">

            <span>✓</span>

            <div>

              <strong>
                Church Profile
              </strong>

              <p>
                Your church information has been completed.
              </p>

            </div>

          </div>





          <div className="setup-check-item">

            <span>✓</span>

            <div>

              <strong>
                Financial Workspace
              </strong>

              <p>
                Accounts and categories are ready.
              </p>

            </div>

          </div>





          <div className="setup-check-item">

            <span>✓</span>

            <div>

              <strong>
                Team Setup
              </strong>

              <p>
                Your team invitations have been processed.
              </p>

            </div>

          </div>



        </div>





        <button

          className="primary-button form-submit"

          onClick={onContinue}

        >

          Continue to Dashboard

        </button>



      </section>

    </main>

  );

}