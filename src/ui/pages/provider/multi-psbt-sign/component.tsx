import { useCallback, useEffect, useState } from "react";

import Layout from "../layout";
import { TailSpin } from "react-loading-icons";
import { IField } from "@/shared/interfaces/provider";
import { useDecodePsbtInputs as useGetPsbtFields } from "@/ui/hooks/provider";
import { t } from "i18next";
import Modal from "@/ui/components/modal";
import SignPsbtFileds from "@/ui/components/sign-psbt-fileds";
import { useControllersState } from "@/ui/states/controllerState";
import { ss } from "@/ui/utils";
import s from "./styles.module.scss";

const MultiPsbtSign = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [fields, setFields] = useState<IField[][]>([]);
  const [fee, setFee] = useState<string>("");
  const [modalInputIndex, setModalInputIndex] = useState<number | undefined>(
    undefined
  );

  const { notificationController } = useControllersState(
    ss(["notificationController"])
  );
  const getPsbtFields = useGetPsbtFields();

  const updateFields = useCallback(async () => {
    if (fields.length <= 0) setLoading(true);
    const resultFields = await getPsbtFields();
    if (resultFields === undefined) {
      await notificationController.rejectApproval("Invalid psbt(s)");
      return;
    }
    setFields(resultFields.fields);
    setFee(resultFields.fee + " BTC");
    setLoading(false);
  }, [getPsbtFields, fields, notificationController]);

  useEffect(() => {
    if (fields.length) return;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    updateFields();
  }, [updateFields, fields]);

  if (loading) return <TailSpin className="animate-spin" />;

  return (
    <Layout
      documentTitle={t("provider.sign_tx")}
      resolveBtnClassName="btn primary"
      resolveBtnText={t("provider.sign")}
    >
      <div className="panel">
        <div className="panel-head">{t("provider.multi_psbt_sign")}</div>
        {fields.map((fieldsArr, i) => (
          <div key={i} className={s.txGroup}>
            <div className={s.txHeading}>Transaction {i + 1}</div>
            <SignPsbtFileds
              fields={fieldsArr}
              setModalInputIndexHandler={setModalInputIndex}
            />
          </div>
        ))}
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

export default MultiPsbtSign;
