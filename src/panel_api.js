import { makeExecutableSchema } from "graphql-tools";
//import { MongoClient, ObjectId } from "mongodb";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import express_graphql from "express-graphql";
import express from "express";
import userSchema from "./schemas/user";
import programSchema from "./schemas/program";

const typeDefs = `
 
  type Status {
    banned: Boolean
    reason: String
  }

  type Access {
    program_id: String
    days: Date
    max_hwids: Int
    ran: Boolean
    status: [Status]
    hwid: [String]
  }

	type User {
    _id: String
    email: String
    jwt: String
	}
  
  type Program {
    _id: String
    name: String
    version: String
    md5: String
  }
  type Token {
    _id: String
    access: [Access]
  }
  
  type Query {
    currentUser: User
    getPrograms: [Program]
    getTokens: [Token]
  }

	type Mutation {
    login(email: String!, password: String!): User
  }
`;

let resolvers = {
  Query: {
    currentUser: (root, args, context) => {
      return context.user;
    },
    getPrograms: async (root, args, { user, mongo }) => {
      if (!user) {
        throw new Error("Cannot perform this action");
      }
      let programs = await mongo.model("programs", programSchema).find({});
      return programs;
    },
    getTokens: async (root, args, { user, mongo }) => {

    }
  },
  Mutation: {
    login: async (root, { email, password }, { mongo, secrets }) => {

      let user = await mongo.model("users", userSchema).findOne({ email: email });
      if (!user) {
        throw new Error("Email not found");
      }
      //console.log(await bcrypt.hash("test", 10));
      let validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        throw new Error("Password is incorrect");
      }

      user.jwt = jwt.sign({ _id: user._id }, secrets.JWT_SECRET);
      return user;
    }
  },
};

// Required: Export the GraphQL.js schema object as "schema"
let schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});


let getUser = async (authorization, secrets, mongo) => {
  let bearerLength = "Bearer ".length;
  if (authorization && authorization.length > bearerLength) {
    let token = authorization.slice(bearerLength);
    let { ok, result } = await new Promise(resolve =>
      jwt.verify(token, secrets.JWT_SECRET, (err, result) => {
        if (err) {
          resolve({
            ok: false,
            result: err
          });
        } else {
          resolve({
            ok: true,
            result
          });
        }
      })
    );

    if (ok) {
      return await mongo.model("users", userSchema).findById(result._id);
    } else {
      console.error(result);
      return null;
    }
  }

  return null;
};


let init = async function (headers, secrets) {
  let mongo = await mongoose.connect(secrets.MONGO_URL);//.then(client => client.model("users", userSchema));
  let user = await getUser(headers['authorization'], secrets, mongo);
  return {
    headers,
    secrets,
    mongo,
    user,
  };
};

let app = express();
app.use("/graphql", (req, res, next) => {
  res.header('Access-Control-Allow-Credentials', true);
  res.header('Access-Control-Allow-Headers', 'content-type, authorization, content-length, x-requested-with, accept, origin');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.header('Allow', 'POST, GET, OPTIONS')
  res.header('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
}, express_graphql(async req => {
  let context = await init(req.headers, {
    MONGO_URL: "mongodb://127.0.0.1/licensu",
    JWT_SECRET: "keyboard-cat"
  })
  return {
    schema: schema,
    graphiql: true,
    context: context
  }
}));
app.listen(4000, () => console.log("Express GraphQL Server Now Running On localhost:4000/graphql"));