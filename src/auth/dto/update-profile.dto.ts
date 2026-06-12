import {
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsUrl,
  IsIn,
  IsDateString,
  IsBoolean,
} from 'class-validator';

export const FULL_NAME_REGEX = /^[\p{L}\s'.-]+$/u;
export const PHONE_REGEX = /^(\+84|0)\d{9}$/;
export const CITY_REGEX = /^[\p{L}\s'.-]+$/u;
export const GENDER_VALUES = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'];

export class UpdateProfileDto {
  @IsOptional()
  @IsString({ message: 'Full name must be a string' })
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  @MaxLength(80, { message: 'Full name must not exceed 80 characters' })
  @Matches(FULL_NAME_REGEX, {
    message: 'Full name contains invalid characters',
  })
  fullName?: string;

  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  @Matches(PHONE_REGEX, {
    message:
      'Phone number must start with 0 or +84 and contain 10 digits total',
  })
  phone?: string;

  @IsOptional()
  @IsString({ message: 'Avatar must be a string' })
  @MaxLength(500, { message: 'Avatar URL is too long' })
  @IsUrl(
    { require_protocol: true },
    { message: 'Avatar URL must start with http:// or https://' },
  )
  avatar?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date of birth must be a valid ISO date' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString({ message: 'Gender must be a string' })
  @IsIn(GENDER_VALUES, { message: 'Gender is invalid' })
  gender?: string;

  @IsOptional()
  @IsString({ message: 'City must be a string' })
  @MinLength(2, { message: 'City must be at least 2 characters' })
  @MaxLength(80, { message: 'City must not exceed 80 characters' })
  @Matches(CITY_REGEX, { message: 'City contains invalid characters' })
  city?: string;

  @IsOptional()
  @IsBoolean({ message: 'profilePublic must be a boolean' })
  profilePublic?: boolean;
}
