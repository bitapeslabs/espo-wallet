import TransactionList from "../wallet/transactions-list";
import s from "./styles.module.scss";

/** The clock tab: full transaction history for the current account. */
const Activity = () => {
  return (
    <div className={s.activity}>
      <TransactionList />
    </div>
  );
};

export default Activity;
