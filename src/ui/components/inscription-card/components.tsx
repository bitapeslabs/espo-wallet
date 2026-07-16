import { FC } from "react";
import { useNavigate } from "react-router-dom";
import { shortAddress } from "@/shared/utils/transactions";

interface Props {
  inscriptionId: string;
}

/**
 * Asset preview card. The Bells content indexer that used to render previews
 * is gone; the card shows a placeholder tile until a new asset source (e.g.
 * alkanes) is wired in.
 */
const InscriptionCard: FC<Props> = ({ inscriptionId }) => {
  const navigate = useNavigate();

  return (
    <div className="asset-card-wrap">
      <div
        className="asset-card"
        onClick={() => {
          navigate("/pages/inscription-details", {
            state: { inscription_id: inscriptionId },
          });
        }}
      >
        <div className="asset-card-preview">
          <span className="asset-card-letter">
            {inscriptionId.slice(0, 1).toUpperCase()}
          </span>
        </div>
        <div className="asset-card-id">{shortAddress(inscriptionId, 6)}</div>
      </div>
    </div>
  );
};

export default InscriptionCard;
