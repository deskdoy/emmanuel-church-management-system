import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useActiveChurch } from "../tenancy/ActiveChurchContext";
import { ChurchSetupWizard } from "../components/setup/ChurchSetupWizard";

export function SetupGate({
  children,
}: {
  children: ReactNode;
}) {

  const {
    activeChurch,
    workspaceMode,
  } = useActiveChurch();


  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);


  useEffect(() => {

    async function checkSetup() {

      if (
        workspaceMode !== "church" ||
        !activeChurch
      ) {
        setLoading(false);
        return;
      }


      const { data, error } =
        await supabase
          .from("church_setup_progress")
          .select("setup_completed")
          .eq(
            "church_id",
            activeChurch.id
          )
          .maybeSingle();


      if (error) {
        console.error(
          "Setup check failed:",
          error
        );

        setLoading(false);
        return;
      }


      // No setup record yet
      if (!data) {

        const { error: createError } =
          await supabase
            .from("church_setup_progress")
            .insert({
              church_id:
                activeChurch.id,
            });


        if (createError) {
          console.error(
            createError
          );
        }


        setNeedsSetup(true);
        setLoading(false);
        return;
      }


      setNeedsSetup(
        !data.setup_completed
      );

      setLoading(false);

    }


    checkSetup();

  }, [
    activeChurch,
    workspaceMode,
  ]);



  if (loading) {
    return (
      <main className="auth-loading">
        Preparing workspace...
      </main>
    );
  }


  if (needsSetup) {
    return (
      <ChurchSetupWizard />
    );
  }


  return children;
}