import { CompletedInscription } from "@/shared/interfaces/inscriptions";
import { useEffect, useState } from "react";
import { t } from "i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { TailSpin } from "react-loading-icons";
import s from "./styles.module.scss";

type PathOf<T> = T extends object
  ? {
      [K in keyof T & (string | number)]: K extends string | number
        ? `${K}` | (T[K] extends object ? `${K}.${PathOf<T[K]>}` : never)
        : never;
    }[keyof T & (string | number)]
  : "";

interface InscField<T, K extends PathOf<T> = PathOf<T>> {
  key: K;
  defaultValue?: any;
}

const fields: InscField<CompletedInscription>[] = [
  {
    key: "content_length",
  },
  {
    key: "inscription_number",
  },
  {
    key: "status.block_height",
  },
  {
    key: "content_type",
  },
  {
    key: "genesis",
  },
  {
    key: "offset",
    defaultValue: 0,
  },
  {
    key: "value",
    defaultValue: "-",
  },
  {
    key: "outpoint",
  },
  {
    key: "inscription_id",
  },
  {
    key: "status.block_time",
  },
];

/**
 * Asset details shell. Details can only be shown for assets passed in via
 * navigation state; there is no indexer to look them up anymore.
 */
const InscriptionDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [inscription, setInscription] = useState<
    CompletedInscription | undefined
  >(undefined);

  useEffect(() => {
    if (!location.state) return navigate(-1);
    if (location.state?.txid) {
      setInscription(location.state);
      return;
    }
    navigate(-1);
  }, [location, navigate]);

  const getValue = <T,>(key: string) => {
    let current = inscription;
    for (const i of key.split(".")) {
      current = (current as any)[i];
    }
    if (key === "status.block_time")
      return new Date((current as unknown as number) * 1000).toLocaleString();
    return current as T;
  };

  if (inscription === undefined) return <TailSpin className="animate-spin" />;

  return (
    <div className={s.detailsWrap}>
      <div className={s.fields}>
        {fields.map((f, i) => (
          <div className={s.item} key={i}>
            <label>{t(`inscription_details.${f.key}`)}</label>
            <div className={s.value}>
              {getValue<string>(f.key) ?? f.defaultValue}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default InscriptionDetails;
