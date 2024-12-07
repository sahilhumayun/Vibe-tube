import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import { User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"


const registerUser = asyncHandler(async (req, res)=> {
  const {fullname, email, username, password}=req.body
  if (
    [fullname , email , password, username].some((field)=>
      field?.trim()==="")
  ){
    throw new ApiError(400, "All fields are required");
  }
  const existedUser = await User.findOne({
    $or: [{ email },{ username }]
  })
  if (existedUser){
    throw new ApiError(409, "This username or email already exist")
  }
  const avatarLocalPath = req.files?.avatar[0]?.path
  const coverImageLocalPath = req.files?.coverImage[0]?.path

  if (!avatarLocalPath){
    throw new ApiError(400, "Avatar image is required");
  }
  const avatar = await uploadOnCloudinary(avatarLocalPath)
  const coverImage = await uploadOnCloudinary(coverImageLocalPath)

  if (!avatar){
    throw new ApiError(400,"Avatar image is required")
  }
 const user =  await User.create({
    fullname,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase()
  })

  const creteatedUser = await User.findById(user._id).select(
    "-password -refreshToken"
  )
  if (!creteatedUser){
    throw new ApiError(500, "user not created");
  }
  return res.status(201).json(
    new ApiResponse(200,creteatedUser,"user created succesfuly")
  )



})

export {registerUser}