// port-usage・port-name-compartment(持ち主の箱を描かないポート。裁定 Q3)、framed-view・view-frame-name-compartment・
// view-frame-info-compartment-tr・view-frame-info-compartment-bl・view-frame-info-contents・frameless-view
part p {
    port x;
    part q;
}
view v {
    expose p::*;
    filter @SysML::PortUsage;
}
