import { useControllersState } from "@/ui/states/controllerState";
import { useGetCurrentWallet } from "@/ui/states/walletState";
import { ss } from "@/ui/utils";
import { useEffect, useState } from "react";
import { TailSpin } from "react-loading-icons";
import { Navigate, useNavigate } from "react-router-dom";
import { ONBOARDING_NEXT_KEY } from "../welcome/component";

const Home = () => {
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string>();
  const currentWallet = useGetCurrentWallet();
  const navigate = useNavigate();

  const { stateController } = useControllersState(ss(["stateController"]));

  useEffect(() => {
    setLoading(true);
    stateController
      .getPendingWallet()
      .then((v) => {
        setLoading(false);
        setPending(v);
      })
      .catch(console.error);
  }, [stateController]);

  useEffect(() => {
    if (loading) return;
    if (pending) {
      navigate("/pages/new-mnemonic", {
        state: {
          pending,
        },
      });
      return;
    }
    if (currentWallet) {
      navigate("/home", { state: { force: true } });
      return;
    }
    // first onboarding: continue to the flow picked on the welcome screen
    const next = sessionStorage.getItem(ONBOARDING_NEXT_KEY);
    if (next) {
      sessionStorage.removeItem(ONBOARDING_NEXT_KEY);
      navigate(next);
    }
  }, [pending, navigate, currentWallet, loading]);

  if (loading) return <TailSpin className="animate-spin" />;

  // the effect above handles pending wallets and the flow picked on the
  // welcome screen; only fall back to the wallet wizard menu when neither
  // applies
  const onboardingNext = sessionStorage.getItem(ONBOARDING_NEXT_KEY);
  if (!currentWallet && !pending && !onboardingNext)
    return <Navigate to={"/pages/create-new-wallet"} />;

  return <TailSpin className="animate-spin" />;
};

export default Home;
