// requirement: 要求・関心事の定義と使用、require・assume の制約と frame の関心事(箱)、satisfy(GR10 では汎用の箱)
package Specs {
    concern def Cost;
    requirement def MassReq {
        assume constraint lightRoad;
        require constraint underLimit;
        frame concern cost : Cost;
    }
    requirement massReq : MassReq;
    part car;
    satisfy massReq by car;
}
