// gr12-require: 宣言する require の制約と frame の関心事(箱)と、参照するだけの require・frame の線 «require»・«frame»(GR12 P1 の裁定 Q2 の (c)・(e))
package Specs {
    concern def Cost;
    concern noise;
    constraint underLimit;
    requirement def MassReq {
        require constraint positive;
        require underLimit;
        frame concern cost : Cost;
        frame noise;
    }
}
