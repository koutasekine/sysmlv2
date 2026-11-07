// 受け継いだポート(^ 付き。裁定 Q7・Q21)
part def Arduino {
    port usb;
    port serial;
}
part s {
    part uno : Arduino;
    part nano : Arduino {
        port :>> serial;
    }
    connect uno.serial to nano.serial;
}
