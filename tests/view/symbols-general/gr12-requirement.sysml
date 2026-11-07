// gr12-requirement: 要求の定義と使用(引数は辺)。要求の使用の subject・actor・stakeholder は節点と線、要求の定義の subject は区画(GR12 P1 の裁定 Q1・Q3)
package Safety {
    requirement def TempReq {
        subject sensor;
        in limit;
    }
    requirement tempReq : TempReq {
        subject monitor;
        actor operator;
        stakeholder owner;
    }
}
