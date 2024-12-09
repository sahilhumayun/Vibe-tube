import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import { User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId)
    const accesToken = user.generateAccessToken()
    const refreshToken = user.generateRefreshToken()

    user.refreshToken=refreshToken
    await user.save({ validateBeforeSave: false })
    
    return {accesToken, refreshToken}

  } catch (error) { 
    throw new ApiError(500,"Something went wrong in genrating token")
  }
  
}

const registerUser = asyncHandler(async (req, res)=> {
  const {fullname, email, username, password}=req.body
  if (
    [fullname , email , password, username].some((field)=>
      field?.trim()==="")
  ){
    throw new ApiError(400, "All fields are required");
  }
  if (!email && !username) {
    throw new ApiError(401,"Username and Email is required")
  }
  const existedUser = await User.findOne({
    $or: [{ email },{ username }]
  })
  if (existedUser){
    throw new ApiError(409, "This username or email already exist")
  }
  const avatarLocalPath = req.files?.avatar[0]?.path
  let coverImageLocalPath;
  if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0 ){
    coverImageLocalPath=req.files.coverImage[0].path
  }
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
 const loginUser = asyncHandler(async (req,res) => {
  const {username,email,password} = req.body
  if (!username || !email){
    throw new ApiError(400,"Username and password is required")
  }
  const user = await User.findOne({
    $or: [{email},{username}]
  })  
  if (!user){
    throw new ApiError(404,"User not found with this email and password")
  }
  const isPasswordValid = await user.isPasswordCorrect(password)
  if (!isPasswordValid){
    throw new ApiError(400,"Password is incorrect")
  }
 const {accesToken,refreshToken} = await generateAccessAndRefreshToken(user._id)

 const loggedInUser = User.findById(user._id).select("-password -refreshToken")

 const options = {
  httpOnly: true,
  secure: true
 }
 return res
 .status(200)
 .cookie("accessToken", accesToken, options)
 .cookie("refreshToken", refreshToken, options)
 .json(new ApiResponse(200,
  {
    user:loggedInUser,accesToken,refreshToken
  },
  "User logged in Successfuly"
)
)

 })
const logoutUser= asyncHandler(async (req,res) => {
  await User.findByIdAndDelete(req.user._id,
    {
      $set:{
        refreshToken: undefined
      }
    },{
      new: true
    })
    const options = {
      httpOnly: true,
      secure: true
     }
     return res
     .status(200)
     .clearcookie("accessToken", options)
     .clearcookie("refreshToken", options)
     .json(new ApiResponse(200,{},"User logout Succesfuly"))
})

export {registerUser , loginUser , logoutUser}