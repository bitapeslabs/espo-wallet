import { useCallback, useEffect, useState } from "react";

import Layout from "../layout";
import { TailSpin } from "react-loading-icons";
import { IField } from "@/shared/interfaces/provider";
import { useDecodePsbtInputs as useGetPsbtFields } from "@/ui/hooks/provider";
import { t } from "i18next";
import Modal from "@/ui/components/modal";
import SignPsbtFileds from "@/ui/components/sign-psbt-fileds";
import notificationController from "@/background/controllers/notificationController";
import toast from "react-hot-toast";
import s from "./styles.module.scss";

const SignPsbt = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [fields, setFields] = useState<IField[]>([]);
  const [modalInputIndex, setModalInputIndex] = useState<number | undefined>(
    undefined
  );
  const [fee, setFee] = useState<string>("");
  const getPsbtFields = useGetPsbtFields();

  const updateFields = useCallback(async () => {
    if (fields.length <= 0) setLoading(true);
    const resultFields = await getPsbtFields();
    if (resultFields === undefined) {
      await notificationController.rejectApproval("Invalid psbt");
      return;
    }
    setFields(resultFields.fields[0]);
    setFee(resultFields.fee + " BTC");
    setLoading(false);
  }, [getPsbtFields, fields]);

  useEffect(() => {
    if (fields.length) return;
    updateFields().catch((e) => {
      if ((e as Error).message) {
        toast.error(e.message);
      }
    });
  }, [updateFields, fields]);

  if (loading) return <TailSpin className="animate-spin" />;

  return (
    <Layout
      documentTitle={t("provider.sign_tx")}
      resolveBtnClassName="btn primary"
      resolveBtnText={t("provider.sign")}
    >
      <div className="panel">
        <div className="panel-head">{t("provider.sign_tx")}</div>
        <SignPsbtFileds
          fields={fields}
          setModalInputIndexHandler={setModalInputIndex}
        />
        <div className={`review-card stat ${s.feeCard}`}>
          <div className="stat-label">{t("provider.fee")}</div>
          <div className="stat-value">{fee}</div>
        </div>
      </div>
      <Modal
        open={modalInputIndex !== undefined}
        onClose={() => {
          setModalInputIndex(undefined);
        }}
        title={t("provider.warning")}
      >
        <div className={s.modalBody}>
          {t("provider.anyone_can_pay_warning")}
        </div>
      </Modal>
    </Layout>
  );
};

export default SignPsbt;
