const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBANDServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
};

initializeDBANDServer();
//snakeToCamelConversion
const snakeToCamel = (eachObject) => {
  return {
    stateId: eachObject.state_id,
    stateName: eachObject.state_name,
    population: eachObject.population,
  };
};

//snakeToCamelInDistrictConversion
const snakeToCamelInDistrict = (eachObject) => {
  return {
    districtId: eachObject.district_id,
    districtName: eachObject.district_name,
    stateId: eachObject.state_id,
    cases: eachObject.cases,
    cured: eachObject.cured,
    active: eachObject.active,
    deaths: eachObject.deaths,
  };
};

//snakeToCamelCaseInStatesConversion
const snakeToCamelCaseInStates = (eachObject) => {
  return {
    totalCases: eachObject.cases,
    totalCured: eachObject.cured,
    totalActive: eachObject.active,
    totalDeaths: eachObject.deaths,
  };
};

//get authenticateToken
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "My_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//user register
app.post("/users/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username= '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `INSERT INTO 
        user (username, name, password, gender, location)
        VALUES
            ( '${username}', '${name}', '${hashedPassword}', '${gender}', '${location}')`;
    await db.run(createUserQuery);
    response.send(`User created Successfully`);
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// user login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "My_SECRET_TOKEN");
      response.send({ jwtToken });
      console.log(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//get all states
app.get("/states/", authenticateToken, async (request, response) => {
  const allStates = `SELECT * FROM state ORDER BY state_id;`;
  const statesList = await db.all(allStates);
  const allStatesResult = statesList.map((eaObject) => {
    return snakeToCamel(eaObject);
  });
  response.send(allStatesResult);
});

//get single state
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getState = `SELECT * FROM state WHERE state_id = ${stateId};`;
  const stateResult = await db.get(getState);
  const getStateResult = snakeToCamel(stateResult);
  response.send(getStateResult);
});

//create a district
app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const createDistrictQuery = `INSERT INTO district(district_name,state_id,cases,cured,active,deaths)
                VALUES ('${districtName}',${stateId}, ${cases},${cured},${active},${deaths});`;
  const createNewDistrict = await db.run(createDistrictQuery);
  response.send("District Successfully Added");
});

//get a single district
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `SELECT * FROM district WHERE district_id = ${districtId};`;
    const districtResult = await db.get(getDistrictQuery);
    const getDistrictResult = snakeToCamelInDistrict(districtResult);
    response.send(getDistrictResult);
  }
);

//delete a district
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteQuery = `DELETE FROM district WHERE district_id = ${districtId};`;
    const deleteResult = await db.run(deleteQuery);
    response.send("District Removed");
  }
);

//update a district details
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateQuery = `UPDATE district
        SET
        district_name = '${districtName}',
        state_id = ${stateId},
        cases =  ${cases},
        cured = ${cured},
        active = ${active},
        deaths = ${deaths}
        WHERE district_id = ${districtId};`;
    const updateResult = await db.run(updateQuery);
    response.send("District Details Updated");
  }
);

//get state details
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const stateDetailsQuery = `SELECT SUM(cases) as cases,
        SUM(cured) as cured, SUM(active) as active, SUM(deaths) as deaths
        FROM district WHERE state_id = ${stateId};`;
    const getStateDetails = await db.get(stateDetailsQuery);
    const resultReport = snakeToCamelCaseInStates(getStateDetails);
    response.send(resultReport);
  }
);

module.exports = app;
