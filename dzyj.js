
let cc = JSON.parse($response.body);

cc = {
  "message" : "查询成功",
  "data" : {
    "endTime" : 4092599349000
  },
  "code" : 0
};

$done({body : JSON.stringify(cc)});
