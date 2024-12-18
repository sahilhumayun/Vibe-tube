import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import { User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"

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
const loginUser = asyncHandler(async (req, res) => {
  const {username,email,password} = req.body
  if (!email && !username) {
    throw new ApiError(400,"Username and Email is required")
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

 const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

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
        refreshToken: 1
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
     .clearCookie("accessToken", options)
     .clearCookie("refreshToken", options)
     .json(new ApiResponse(200,{},"User logout Succesfuly"))
})

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

  if (!incomingRefreshToken) {
      throw new ApiError(401, "unauthorized request")
  }

  try {
      const decodedToken = jwt.verify(
          incomingRefreshToken,
          process.env.REFRESH_TOKEN_SECRET
      )
  
      const user = await User.findById(decodedToken?._id)
  
      if (!user) {
          throw new ApiError(401, "Invalid refresh token")
      }
  
      if (incomingRefreshToken !== user?.refreshToken) {
          throw new ApiError(401, "Refresh token is expired or used")
          
      }
  
      const options = {
          httpOnly: true,
          secure: true
      }
  
      const {accessToken, newRefreshToken} = await generateAccessAndRefereshTokens(user._id)
  
      return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
          new ApiResponse(
              200, 
              {accessToken, refreshToken: newRefreshToken},
              "Access token refreshed"
          )
      )
  } catch (error) {
      throw new ApiError(401, error?.message || "Invalid refresh token")
  }

})

const changeCurrentPassword = asyncHandler(async (req,res) => {
  const {oldPassword, newPassword} = req.body 
  const user = await User.findById(req.user?._id)
  isPasswordValid= await user.isPasswordCorrect(oldPassword) 
  if (!isPasswordCorrect) {
    throw new ApiError(401,"Invalid old Password");  
  }
  user.password=newPassword
  await user.save({validateBeforeSave: false})
  res
  .status(200)
  .json(new ApiResponse(200,{},"Password Changed Sucessfuly"))
})

const getCurrentUser = asyncHandler(async(req,res)=>{
  req.status(200).json(
    new ApiResponse(200,req.user,"get user details sucessfuly")
  )
})
const updateAccountDetails = asyncHandler(async (req,res) => {
  const {email, fullname}= req.body
  if (!email || !fullname) {
    throw new ApiError(401, "both fields are reqiured");
  }
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        fullname,
        email
      }
    },
    {new : true}
  ).select("-password")

  return res
  .status(200)
  .json(new ApiResponse (200,user,"Account details updated sucessfuly"))
})

const updateAvatar = asyncHandler(async (req,res) => {
  const {avatarLocalPath} = req.file?.path
  if (!avatarLocalPath) {
    throw new ApiError("Avatar file is missing")
  }
  const avatar = await uploadOnCloudinary(avatarLocalPath)
  if (!avatar.url) {
    throw new ApiError("Avatar file is missing")
  }
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        avatar: avatar.url
      }
    },
    {new : true}
  ).select("-password")
  return res
  .status(200)
  .json(new ApiResponse(200,user,"Avatar changes Sucessfuly"))

})
const updatCoverImage = asyncHandler(async (req,res) => {
  const {coverImageLocalPath} = req.file?.path
  if (!coverImageLocalPath) {
    throw new ApiError("CoverImage file is missing")
  }
  const coverImage = await uploadOnCloudinary(coverImageLocalPath)
  if (!coverImage.url) {
    throw new ApiError("CoverImage file is missing")
  }
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        coverImage: coverImage.url
      }
    },
    {new : true}
  ).select("-password")
  return res
  .status(200)
  .json(new ApiResponse(200,user,"CoverImage changes Sucessfuly"))

})

const getUserChannelprofile = asyncHandler(async (req,res) => {
  const username = req.params

  if (!username?.trim()){
    throw new ApiError(400,"Username is missing")
  }
  const channel = await User.aggregate([{
    $match: {
      username: username?.toLowerCase()
    }},{
      $lookup:{
        from: "subscriptions",
        localfield: "_id",
        foreignField: "channel",
        as: "subscribers"
      }
    },{
      $lookup:{
        from: "subscriptions",
        localfield: "_id",
        foreignField: "subscribers",
        as: "subscribeTo"
      }
    },{
      $addFields:{
        subscribesCount: {
          $size: "$subscribers"
        },
        channelSubscribeTo: {
          $size: "$subscribeTo"
        },
        isSubscribed:{
          $cond:{
            if: {$in: [req.user?._id, "$subscribers.subscriber"]},
            then:true,
            else:false
          }
        }
      }
    },{
      $project:{
        fullname:1,
        email:1,
        username:1,
        subscribesCount:1,
        avatar:1,
        coverImage:1,
        isSubscribed:1,
        channelSubscribeTo:1,

      }
    }
  ])
  if (!channel?.length) {
    throw new ApiError(404,"channel not found with this name");    
  }
  return res
  .status(200)
  .json(
    new ApiResponse(200,channel[0],"Channel fatched Sucessfuly")
  )

})

const getWatchHistory = asyncHandler(async (req,res) => {
  const user = await User.aggregate([
    {
      $match:{
        _id: new mongoose.Types.ObjectId(req.user?._id)
      }
    },{
      $lookup:{
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline:[
          {
            $lookup:{
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as:"owner",
              pipeline:[
                {
                  $project:{
                    fullname:1,
                    username:1,
                    avatar:1
                  }
                }
              ]
            }
          },{
            $addFields:{
              owner:{
                $first: "$owner"
              }
            }
          }
        ]
      }
    }
  ]) 
  return res
  .status(200)
  .json(
    new ApiResponse(200,user[0].watchHistory,"get user watch history sucessfuly")
  ) 
})

export { registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, updatCoverImage, updateAvatar,getUserChannelprofile,getWatchHistory}