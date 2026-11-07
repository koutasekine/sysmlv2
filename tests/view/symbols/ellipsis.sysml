// ellipsis-at-lower-left-corner(filter で除いたメンバーがある箱。裁定 Q15)
part p {
    part a;
    attribute b;
}
view v {
    expose p::**;
    filter @SysML::PartUsage;
}
