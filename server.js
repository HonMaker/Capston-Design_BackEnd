var express = require('express');
var http = require('http');
var bodyParser = require('body-parser');
var app = express();
var mysql = require("sync-mysql");
var async = require("async");

var connection = new mysql({
    host : 'db.cttjllinya6r.ap-northeast-2.rds.amazonaws.com',
    user : 'admin',
    password : '/*my password*/',
    database : 'hone_maker'
});


app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Firebase UID 받아서 이미 있는지 새로운 UID 인지 판단후 새로운 UID면 DB에 추가
app.post('/', function (req, res) {
    var UID = req.body.UID;
    async.waterfall([
        function (callback) {
            let firstResult = connection.query('select * from user');
            var UIDexisted = false;
            for (var i = 0; i < firstResult.length; i++) {
                if (UID == firstResult[i].u_Id) {
                    UIDexisted = true;
                }
            }
            callback(null, UIDexisted);
        },
        // func2 (args 2개 지정)
        function (UIDexisted, callback) {
            if (UIDexisted == false) {
                console.log("새로운 UID");
                connection.query('insert into user(u_Id) values("' + UID + '")');
                var json = "succeed";
            }
            else {
                console.log("이미 있는 UID");
                var json = "succeed";
            }
	    console.log(UID);
            callback(null, json);
        },
    ],
        function (err, result) {
            console.log(result);
            res.send(result);
        }
    )
});


// 사용자 재료 스스로 추가
// POST : 52.79.234.234/user/ingredients/put
// parameter : UID, ing_Name
// return => ing_Name, ing_imageURL, ing_Location
app.post('/user/ingredients/put', function(req, res) {
    var UID = req.body.UID;
    var ing_Name = req.body.ing_Name;

    async.waterfall([
        checkIngredient,
        checkRefrigerator,
        insertIngredient
    ],
        function  (err, result) {
            console.log(result);
            res.send(result);
        });

        function checkIngredient(callback) {
            var rows = connection.query('select * from ingredient where ing_Name ="'+ing_Name+'"');
            callback(null, rows[0])
        }
        function checkRefrigerator(ing, callback) {
            var result;
            var notResult = true;
            if(ing.length == 0 ) {
                result = "DB에 없는 재료입니다.";
            }
            else {
                var rows = connection.query('select * from refrigerator where u_Id ="'+UID+'" and ing_Id='+ing.ing_Id);
                if(rows.length != 0  ) {
                    result = "이미 냉장고에 존재하는 재료입니다.";
                }
                else {
                    result = {
                        "ing_Name" : ing.ing_Name,
                        "ing_imageURL" : ing.ing_ImageURL,
                        "ing_Location" : ing.ing_Location
                    };
                    notResult = false;
                }
            }
            callback(null, result, notResult, ing.ing_Id);
        }
        function insertIngredient(result, notResult, ing_Id, callback) {

            if(!notResult) {
               connection.query(' insert into refrigerator values("'+UID+'", '+ing_Id+');' ); 
            }
            callback(null, result);
        }
});


// 사용자 재료 스스로 삭제
// POST : 52.79.234.234/user/ingredients/delete
// parameter : UID, ing_Name
// return => String( " Succeed "  or " Fail ")
app.post('/user/ingredients/delete', function(req, res) {
    var UID = req.body.UID;
    var ing_Name = req.body.ing_Name;

    async.waterfall([
        function (callback) {
            let rows = connection.query('select * from ingredient where ing_Name ="'+ing_Name+'"');
            callback(null, rows);
        },
        function (ing, callback) {
            var Iid;
            var NotExisted = true;
            if ( ing.length != 0) {
                Iid = ing[0].ing_Id;
                connection.query('delete from refrigerator where u_Id="'+UID+'" and ing_Id='+Iid);
                NotExisted = false;
            }
            callback(null, Iid, NotExisted);
        }
    ],
        function (err, result, NotExisted) {
            
            if(NotExisted) {
                res.send("이미 없는 재료입니다.");
            }
            else {
                res.send(result + "번 재료 삭제 ");
            }
		
        }
    )
});






// 사용자 재료 주기
// GET : 52.79.234.234/ingredients/get
// parameter : UID
// res.send =>  재료이름 , 재료 이미지 , Location
app.get('/ingredients/get', function (req, res) {
    var UID = req.body.UID;

    async.waterfall([
        getIngredients,
        getIng
    ],
        function (err, result) {
            res.send(result);
            console.log(result);
        });

    function getIngredients(callback) {
        var rows = connection.query(' select * from refrigerator where u_Id="' + UID + '"');
        var ings = new Array();
        for(var i=0 ; i<rows.length ; i++ ){
            ings.push(rows[i].ing_Id);
        }
        callback(null, ings);
    }
    function getIng(ings, callback) {
	    var result = new Array();
 if(ings.length != 0 ) {
        var str = "";
        for (i = 0; i < ings.length - 1; i++) {
            str = str.concat("ing_Id = " + ings[i] + " or ");
        }
        str = str.concat("ing_Id = " + ings[i]);

        let rows = connection.query('select ing_Name, ing_Location, ing_ImageURL from ingredient where ' + str +';');

        for (var i = 0; i < rows.length; i++) {
            var jsonFile =
            {
                'ing_Name': rows[i].ing_Name,
                'ing_Location': rows[i].ing_Location,
                'ing_URL': rows[i].ing_ImageURL
            };
            result.push(jsonFile);
        }
 }
	  
        callback(null, result);
    }
});




// 텍스트를 받아 재료 추출 후 DB 냉장고에 넣기 
// POST  :  52.79.234.234/ingredients/put 
// parameter : UID, text
// res.send => ing_Name : "" , ing_Location : "" , ing_URL : ""  Array
app.post('/ingredients/put', function (req, res) {

    var UID = req.body.UID;
    var text = req.body.text;

    async.waterfall([
        function (callback) {
            let rows = connection.query('select ing_Id, ing_Name from ingredient');
           console.log(text); 
	   var ingredientsId = new Array();
            var ingredientsName = new Array();
            for (var i = 0; i < rows.length; i++) {
                ingredientsId.push(rows[i].ing_Id);
                ingredientsName.push(rows[i].ing_Name);
            }
            var returnIn = new Array();
            for (var i = 0; i < ingredientsId.length; i++) {
                if (text.includes(ingredientsName[i])) {
                    returnIn.push(ingredientsId[i]);
                }
            }
            var single = returnIn.reduce((a, b) => {
                if (a.indexOf(b) < 0) a.push(b);
                return a;
            }, []);
            callback(null, single);
        },  // single : 텍스트에서 추출한 재료의 배열
        function (single, callback) {

            let rows = connection.query('select ing_Id from refrigerator where u_Id = "' + UID + '" ');

            var NotExisted = new Array();
            for (var i = 0; i < single.length; i++) {
                NotExisted.push(single[i]);
            }

            var rowData = new Array();
            for (var i = 0; i < rows.length; i++) {
                rowData.push(rows[i].ing_Id);
            }

            for (var i = 0; i < single.length; i++) {
                for (var j = 0; j < rowData.length; j++) {
                    if (single[i] == rowData[j]) {
                        for (var k = 0; k < NotExisted.length; k++) {
                            if (NotExisted[k] == single[i])
                                NotExisted.splice(k, 1);
                        }
                    }
                }
            }
            var uid = UID;
            callback(null, NotExisted, single);
        },  // NotExisted : 자신의 UID 에 존재하지 않는 재료의 배열 
        function (NotExisted, allIng, callback) {
            if (NotExisted.length != 0) {
                for (var i = 0; i < NotExisted.length; i++) {
                    connection.query(
                        ' insert into refrigerator(u_Id, ing_Id) values("' + UID + '", ' + NotExisted[i] + ');  '
                    );
                }
            }
            callback(null, NotExisted, allIng);
        }, // NotExisted : 자신의 UID 에 존재하지 않는 재료의 배열 
        function (NotExisted, allIng, callback) {
            if (NotExisted.length != 0) {
                var i;
                var str = "";
                for (i = 0; i < NotExisted.length - 1; i++) {
                    str = str.concat("ing_Id = " + NotExisted[i] + " or ");
                }
                str = str.concat("ing_Id = " + NotExisted[i]);
            }
            callback(null, str, NotExisted.length, allIng);
        },
        function (str, NotExistedlength, allIng, callback) {
            if (NotExistedlength != 0) {
                var iName = new Array();
                var iLoc = new Array();
                var iURL = new Array();
                let result = connection.query('select ing_Name, ing_Location, ing_ImageURL from ingredient where ' + str + ';');
                var i;
                for (i = 0; i < NotExistedlength; i++) {
                    iName.push(result[i].ing_Name);
                    iLoc.push(result[i].ing_Location);
                    iURL.push(result[i].ing_ImageURL);
                }
            }
            callback(null, iName, iLoc, iURL, NotExistedlength, allIng);
        },
        function (iName, iLoc, iURL, NotExistedlength,allIng, callback) {
            var j = new Array();
		
		
            for (var i = 0; i < NotExistedlength; i++) {
                var jsonFile =
                {
                    'ing_Name': iName[i],
                    'ing_Location': iLoc[i],
                    'ing_URL': iURL[i]
                };
                j.push(jsonFile);
            }
		
            callback(null, j);
        }
    ],
        function (err, result) {
           
	   console.log(result);
            res.send(result);
		
        }
    )
});


// 평점 매기기
// POST : 52.79.234.234/rating/put 
// parameter : uid, food, ratio
// res.send => string형식 succeed  or fail
app.post('/rating/put', function (req, res) {
    var UID = req.body.uid;
    var foodName = req.body.food;
    var rating = req.body.ratio;

    async.waterfall([
        getRecipeName,
        putRating,
        getTotalRating,
        updateTotalRating,
    ],
        function (err, result) {
            res.send("succeed");
            console.log(result);
        });

    function getRecipeName(callback) {
        var rows = connection.query('select rec_Id from recipelist where rec_Name = "' + foodName + '"');
        callback(null, rows[0].rec_Id);
    }

    function putRating(rec_Id, callback) {
        connection.query(' insert into eachRating values("' + UID + '",' + rec_Id + ', ' + rating + ') ');
        var str = "사용자 " + UID + " 의 " + rec_Id + "에 대한 평점 : " + rating;
        callback(null, str, rec_Id);
    }

    function getTotalRating(str, rec_Id, callback) {
        var rows = connection.query(' select * from  eachRating where rec_Id =' + rec_Id);
        var totalRatio = 0;
        for (var i = 0; i < rows.length; i++) {
            totalRatio = totalRatio + rows[i].ratio;
        }
        var avgRatio = totalRatio / rows.length;
        callback(null, avgRatio, rec_Id, str);
    }

    function updateTotalRating(avgRatio, rec_Id, str, callback) {
        connection.query('update recipelist set avgRatio = ' + avgRatio + ' where rec_Id =' + rec_Id);
        callback(null, str);
    }

})


// 레시피 추천
// GET : 52.79.234.234/recommend 
// parameter : UID
// res.send => 음식이름, 음식png, 레시피url
app.get('/recommend', function (req, res) {
    var UID = req.body.UID;

    async.waterfall([
        function (callback) {
            var userIng = new Array();
            var rows = connection.query('select ing_Id from refrigerator where u_Id ="'+UID+'"');
            for (var i = 0; i < rows.length; i++) {
                userIng.push(rows[i].ing_Id);
            }
            callback(null, userIng);
            // userIng : user가 가지고있는 재료
        },
        function (userIng, callback) {
            var cnt = connection.query('select rec_Id, count(rec_Id) as num from recipe where ing_Imp =1 group by rec_Id');
            callback(null, userIng, cnt);
            // userIng : user가 가지고있는 재료
            // cnt : 각 음식에 대해 1인 재료의 개수
        },
        function (userIng, cnt, callback) 
        {
            var recsWhichAllIngExisted = new Array();
            var rows = connection.query('select rec_Id, ing_Id from recipe where ing_Imp =1 ');
            for (var i = 0; i < cnt.length; i++) {
                
                var count = 0;
                for (var j = 0; j < rows.length; j++) {
                    if (cnt[i].rec_Id == rows[j].rec_Id) {
                        if(userIng.includes(rows[j].ing_Id)) {
                            count++;
                        }
                    }
                }
                
                if (count == cnt[i].num) {
                    recsWhichAllIngExisted.push(cnt[i].rec_Id);
                }
            }
            callback(null, recsWhichAllIngExisted);
            // recsWhichAllIngExisted : 현 사용자의 재료로 만들 수 있는 모든 음식(주재료)
        },
        function (recCanCook, callback) {
            var rows = connection.query('select * from eachRating where u_Id = "' + UID + '"');
            var RatioDoesNotExisted = false;
            if (rows.length == 0) {
                RatioDoesNotExisted = true;
            }
            callback(null, recCanCook, RatioDoesNotExisted)
            // recCanCook : 현 사용자의 재료로 만들 수 있는 모든 음식(주재료)
            // RatioDoesNotExisted : 현 사용자가 평점을 한번도 매기지 않았으면 true
        },
        function (recCanCook, RatioDoesNotExisted, callback) {
            var highestRec;
            var highest = new Array();
            if (RatioDoesNotExisted) { highestRec = 0; }
            else {
                var rows = connection.query('select * from eachRating where u_Id = "' + UID + '" order by ratio desc');
                highestRec = rows[0].rec_Id;
                highest.push(rows[0].rec_Id);

                for (var i = 1; i < rows.length; i++) {
                    if (rows[0].ratio == rows[i].ratio) {
                        highest.push(rows[i].rec_Id);
                    }
                }
                var index = Math.floor(Math.random() * highest.length);
                highestRec = rows[index].rec_Id;
            }
            callback(null, recCanCook, highestRec);
            // recCanCook : 현 사용자의 재료로 만들 수 있는 모든 음식(주재료)
            // highestRec : 현 사용자가 가장 높게 평점을 매긴 rec_Id ( 여러개면 random ) ( 평점이 없으면 0 )
        },
        function (recCanCook, highestRec, callback) {
            var rows = connection.query('select * from recipelist');
            callback(null, recCanCook, highestRec, rows.length);


            // recCanCook : 현 사용자의 재료로 만들 수 있는 모든 음식(주재료)
            // highestRec : 현 사용자가 가장 높게 평점을 매긴 rec_Id ( 평점이 없으면 0 )
            // rows.length : 음식 개수
        },
        function (recCanCook, highestRec, recLength, callback) {
            var similarityRec = new Array();  // 음식 ID 
            var similarityValue = new Array(); // ID의 유사값
            if (highestRec != 0) {
                var rows = connection.query('select * from eachRating order by rec_Id');
                var rows2 = connection.query('select * from eachRating where rec_Id =' + highestRec);

                for (var i = 1; i <= recLength; i++) {
                    var eachSim = 0;
                    var IdX = new Array();
                    var IdHighest = new Array();


                    for (var j = 0; j < rows.length; j++) {
                        if (rows[j].rec_Id == i) {
                            for (var k = 0; k < rows2.length; k++) {
                                if (rows2[k].u_Id == rows[j].u_Id) {
                                    IdX.push(rows[j].ratio);
                                    IdHighest.push(rows2[k].ratio);
                                }
                            }
                        }
                    }
                    // 음식 i 와 highestRec 의 유사도 계산
                    var firstDenominator = 0;
                    var secondDenominator = 0;
                    var molecule = 0;
                    for (var l = 0; l < IdX.length; l++) {
                        molecule += (IdX[l] * IdHighest[l]);
                        firstDenominator += Math.pow(IdX[l], 2);
                        secondDenominator += Math.pow(IdHighest[l], 2);
                    }
                    if (i == highestRec) eachSim = 1;
                    else {
                        eachSim = molecule / ((Math.sqrt(firstDenominator)) * (Math.sqrt(secondDenominator)));
                        // eachSim 계산
                    }
                    similarityRec.push(i); // 음식 i 의 id
                    similarityValue.push(eachSim);  // 음식 i 와 highestRec의 유사도
                }
            }
            callback(null, recCanCook, similarityRec, similarityValue);
        },
        function (recCanCook, similarityRec, similarityValue, callback) {
            if (similarityRec.length == 0) {
                var rows = connection.query('select rec_Id ,avgRatio from recipelist order by avgRatio desc');
                for(var i=0 ; i<rows.length ; i++) {
                    similarityRec.push(rows[i].rec_Id)
                }
            }
            else {
                for (var i = 0; i < similarityRec.length - 1; i++) {
                    for (var j = i + 1; j < similarityRec.length; j++) {
                        if (similarityValue[i] < similarityValue[j]) {
                            var idTMP = similarityRec[i]; var valueTMP = similarityValue[i];
                            similarityRec[i] = similarityRec[j]; similarityValue[i] = similarityValue[j];
                            similarityRec[j] = idTMP; similarityValue[j] = valueTMP;
                        }
                    }
                }
                console.log("rec_Id " + similarityRec);
                console.log("rec_Id 와의 유사도 : ");
                console.log(similarityValue);
            }
            callback(null, recCanCook, similarityRec);
        },
        function (recCanCook, similarityRec, callback) {
            var includeIng = new Array();
            var notIncludeIng = new Array();

            for (var i = 0; i < 6; i++) { // 6 개 추천
                if (recCanCook.includes(similarityRec[i])) {
                    includeIng.push(similarityRec[i]);
                }
                else {
                    notIncludeIng.push(similarityRec[i]);
                }
            }

            callback(null, includeIng, notIncludeIng);
        },
        function (includeIng, notIncludeIng, callback) {
            var result = {
                "contained": [
                ],
                "uncontained": [
                ]
            };
            var rows = connection.query('select * from recipelist');
            var allRecId = new Array();
            for (var i = 0; i < rows.length; i++) {
                allRecId.push(rows[i]);
            }
            for (var i = 0; i < includeIng.length; i++) {
                for (var j = 0; j < allRecId.length; j++) {
                    if (includeIng[i] == allRecId[j].rec_Id) {
                        result.contained.push({
                            "rec_Name": rows[j].rec_Name,
                            "rec_imageURL": rows[j].rec_imageURL,
                            "rec_recipeURL": rows[j].rec_recipeURL
                        });
                    }
                }
            }
            for (var i = 0; i < notIncludeIng.length; i++) {
                for (var j = 0; j < allRecId.length; j++) {
                    if (notIncludeIng[i] == allRecId[j].rec_Id) {
                        result.uncontained.push({
                            "rec_Name": rows[j].rec_Name,
                            "rec_imageURL": rows[j].rec_imageURL,
                            "rec_recipeURL": rows[j].rec_recipeURL
                        });
                    }
                }
            }
            callback(null, result);
        }
    ],
        function (err, result) {
            console.log(result);
            res.send(result);
        }
    )


});

// DB 안의 자료 확인

// 1. h_user

app.get('/data/h_user', function (req, res) {
    let sql = `SELECT * FROM h_user`;
    connection.query(sql, function (err, rows, fields) {
        if (!err) {
            console.log('The solution is: ', rows);
            res.send(rows);
        }
        else
            console.log('Error while performing Query.', err);
    });
});

// 2. ingredient

app.get('/data/ingredient', function (req, res) {
    let sql = `SELECT * FROM ingredient`;
    connection.query(sql, function (err, rows, fields) {
        if (!err) {
            console.log('The solution is: ', rows);
            res.send(rows);

        }
        else
            console.log('Error while performing Query.', err);
    });
});

// 3. recipe

app.get('/data/recipe', function (req, res) {
    let sql = `SELECT * FROM recipe`;
    connection.query(sql, function (err, rows, fields) {
        if (!err) {
            console.log('The solution is: ', rows);
            res.send(rows);
        }
        else
            console.log('Error while performing Query.', err);
    });
});

// 4. refrigerator 

app.get('/data/refrigerator', function (req, res) {
    let sql = `SELECT * FROM refrigerator`;
    connection.query(sql, function (err, rows, fields) {
        if (!err) {
            console.log('The solution is: ', rows);
            res.send(rows);
        }
        else
            console.log('Error while performing Query.', err);
    });
});

app.listen(80, function () {
    console.log('Server is running in port 80');
});