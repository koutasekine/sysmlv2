// attribute(持ち主の箱を描かない属性。裁定 Q13)・attribute-name-compartment
part p {
    attribute a : Real;
    part q;
}
view v {
    expose p::a;
}
