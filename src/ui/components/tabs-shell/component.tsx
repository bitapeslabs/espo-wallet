import { Outlet } from "react-router-dom";
import BottomNav from "../bottom-nav";
import s from "./styles.module.scss";

/** Layout for the main tab pages: routed content plus the bottom navbar. */
const TabsShell = () => {
  return (
    <div className={s.shell}>
      <div className={s.content}>
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
};

export default TabsShell;
